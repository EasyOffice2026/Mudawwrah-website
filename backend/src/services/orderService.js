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
  // Named rather than only referenced, so the kitchen sees which branch is
  // collecting without a second lookup. Null once a branch is retired.
  pickupLocation: { select: { id: true, nameEn: true, nameAr: true, addressEn: true, addressAr: true } },
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
  // A branch id arrives from the client, and a foreign key alone would happily
  // accept another restaurant's branch. This read is tenant-scoped, so a
  // branch belonging to anyone else simply is not found.
  if (orderType === 'PICKUP' && payload.pickupLocationId) {
    const branch = await prisma.pickupLocation.findUnique({
      where: { id: payload.pickupLocationId },
      select: { id: true, isActive: true },
    });
    if (!branch) throw new HttpError(400, 'That pickup location does not exist');
    if (!branch.isActive) throw new HttpError(409, 'That pickup location is not taking orders');
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
      deliveryLat: orderType === 'PICKUP' ? null : payload.deliveryLat ?? null,
      deliveryLng: orderType === 'PICKUP' ? null : payload.deliveryLng ?? null,
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
      // Only meaningful for collection; a delivery order carries no branch.
      pickupLocationId: orderType === 'PICKUP' ? payload.pickupLocationId || null : null,
      // Where this sale came from. Recorded on the order rather than inferred
      // later, because the link the customer arrived on is gone by then.
      utmSource: payload.utmSource || null,
      utmMedium: payload.utmMedium || null,
      utmCampaign: payload.utmCampaign || null,
      utmTerm: payload.utmTerm || null,
      utmContent: payload.utmContent || null,
      referrer: payload.referrer || null,
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

/**
 * Public order tracking. The id is an unguessable uuid handed to the customer
 * at checkout, which is what authorises the lookup — a web customer has no
 * account yet, so there is nothing else to authenticate against.
 *
 * Deliberately narrow: enough to show progress, nothing that would matter if
 * the link were forwarded. No phone, no address, no payment detail.
 */
export const track = async (id) => {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      orderType: true,
      total: true,
      createdAt: true,
      items: { select: { nameEn: true, nameAr: true, quantity: true } },
    },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  return order;
};

/**
 * A signed-in customer's own orders, newest first.
 *
 * Scoped by userId as well as tenant, so this can never return someone else's
 * order even if the caller is authenticated. Includes the line detail the
 * history screen needs to rebuild a basket for reordering.
 */
export const listMine = (userId, { page = 1, pageSize = 20 } = {}) =>
  prisma.$transaction(async (tx) => {
    const where = { userId };
    const [total, data] = await Promise.all([
      tx.order.count({ where }),
      tx.order.findMany({
        where,
        include: { items: { include: { menuItem: { select: { id: true, isAvailable: true, isOutOfStock: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
    ]);
    return { data, total, page: Number(page), pageSize: Number(pageSize) };
  });
