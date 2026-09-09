import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenant } from '../tenantContext.js';
import { resolve as resolvePromotion } from './promotionService.js';
import { getAll as getSettings } from './settingService.js';
import { notifyStatusChange } from './whatsapp/notifications.js';

const include = {
  items: { include: { menuItem: true } },
  user: { select: { id: true, name: true, email: true } },
  feedback: true,
};

const round3 = (value) => Number(Number(value).toFixed(3));

// The count is already confined to the current tenant, so two restaurants can
// each run their own MD20260811-0001 without colliding.
const generateOrderNumber = async () => {
  const today = new Date();
  const code = (currentTenant()?.slug || 'md').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || 'MD';
  const prefix = `${code}${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const count = await prisma.order.count({ where: { orderNumber: { startsWith: prefix } } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
};

export const create = async (payload) => {
  const settings = await getSettings();
  if (settings.isOpen !== 'true') throw new HttpError(409, 'The restaurant is currently closed for orders');

  const menuItems = await prisma.menuItem.findMany({ where: { id: { in: payload.items.map((i) => i.menuItemId) } } });
  const options = await prisma.customizationOption.findMany({
    where: { menuItemId: { in: menuItems.map((i) => i.id) } },
  });

  const lines = payload.items.map((line) => {
    const item = menuItems.find((m) => m.id === line.menuItemId);
    if (!item) throw new HttpError(400, `Menu item ${line.menuItemId} not found`);
    if (!item.isAvailable || item.isOutOfStock) throw new HttpError(409, `${item.nameEn} is currently unavailable`);
    const selected = (line.optionIds || []).map((optionId) => {
      const option = options.find((o) => o.id === optionId && o.menuItemId === item.id);
      if (!option) throw new HttpError(400, `Customization option ${optionId} is not valid for ${item.nameEn}`);
      return option;
    });
    const extras = selected.reduce((sum, o) => sum + Number(o.extraPrice), 0);
    const unitPrice = round3(Number(item.price) + extras);
    return {
      menuItemId: item.id,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      unitPrice,
      quantity: line.quantity,
      lineTotal: round3(unitPrice * line.quantity),
      customizations: selected.length
        ? selected.map((o) => ({ id: o.id, nameEn: o.nameEn, nameAr: o.nameAr, extraPrice: Number(o.extraPrice) }))
        : undefined,
    };
  });

  const subtotal = round3(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  if (subtotal < Number(settings.minimumOrder)) {
    throw new HttpError(422, `Minimum order value is KWD ${Number(settings.minimumOrder).toFixed(3)}`);
  }

  const orderType = payload.orderType === 'PICKUP' ? 'PICKUP' : 'DELIVERY';
  if (orderType === 'PICKUP' && settings.pickupEnabled !== 'true') {
    throw new HttpError(409, 'This restaurant is not accepting pickup orders');
  }
  if (orderType === 'DELIVERY' && settings.deliveryEnabled !== 'true') {
    throw new HttpError(409, 'This restaurant is not accepting delivery orders');
  }
  // Collecting in person is never charged for delivery, and carries no address.
  let deliveryFee = orderType === 'PICKUP' ? 0 : round3(settings.deliveryFee);

  // The voucher is re-resolved from the database; the client only sends a code.
  const { promotion, discount, freeDelivery } = await resolvePromotion(payload.promoCode, subtotal, deliveryFee);
  if (freeDelivery) deliveryFee = 0;

  const discountedSubtotal = round3(subtotal - discount);
  const serviceCharge = round3((discountedSubtotal * Number(settings.serviceChargePercent)) / 100);
  // taxPercent was previously editable in admin but never applied to a total.
  const tax = round3(((discountedSubtotal + serviceCharge) * Number(settings.taxPercent || 0)) / 100);
  const tip = orderType === 'PICKUP' ? 0 : Math.max(0, round3(payload.tip || 0));
  const total = round3(discountedSubtotal + deliveryFee + serviceCharge + tax + tip);

  return prisma.order.create({
    data: {
      orderNumber: await generateOrderNumber(),
      userId: payload.userId || null,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      // Pickup carries no address at all, so the structured parts the WhatsApp
      // flow collects are dropped alongside the composed line.
      address: orderType === 'PICKUP' ? null : payload.address,
      area: orderType === 'PICKUP' ? null : payload.area || null,
      block: orderType === 'PICKUP' ? null : payload.block || null,
      street: orderType === 'PICKUP' ? null : payload.street || null,
      building: orderType === 'PICKUP' ? null : payload.building || null,
      notes: payload.notes,
      channel: payload.channel || 'WEB',
      paymentMethod: payload.paymentMethod || 'CASH',
      orderType,
      subtotal,
      deliveryFee,
      serviceCharge,
      tax,
      promoCode: promotion?.code || null,
      discount,
      tip,
      cutlery: Boolean(payload.cutlery),
      deliveryNote: payload.deliveryNote || null,
      total,
      items: { create: lines },
    },
    include,
  });
};

export const list = ({ status, channel, from, to, search, page = 1, pageSize = 20 } = {}) => {
  const where = {
    ...(status ? { status } : {}),
    ...(channel ? { channel } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search, mode: 'insensitive' } },
            { customerName: { contains: search, mode: 'insensitive' } },
            { customerPhone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  return prisma.$transaction(async (tx) => {
    const [total, data] = await Promise.all([
      tx.order.count({ where }),
      tx.order.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
    ]);
    return { data, total, page: Number(page), pageSize: Number(pageSize) };
  });
};

export const getById = async (id) => {
  const order = await prisma.order.findUnique({ where: { id }, include });
  if (!order) throw new HttpError(404, 'Order not found');
  return order;
};

export const updateStatus = async (id, status) => {
  const current = await getById(id);
  if (current.status === status) return current;
  const order = await prisma.order.update({ where: { id }, data: { status }, include });
  await notifyStatusChange(order);
  return order;
};
