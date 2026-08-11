import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenant } from '../tenantContext.js';
import { getAll as getSettings } from './settingService.js';

const include = { items: { include: { menuItem: true } }, user: { select: { id: true, name: true, email: true } } };

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
  const deliveryFee = round3(settings.deliveryFee);
  const serviceCharge = round3((subtotal * Number(settings.serviceChargePercent)) / 100);
  // taxPercent was previously editable in admin but never applied to a total.
  const tax = round3(((subtotal + serviceCharge) * Number(settings.taxPercent || 0)) / 100);
  const total = round3(subtotal + deliveryFee + serviceCharge + tax);

  return prisma.order.create({
    data: {
      orderNumber: await generateOrderNumber(),
      userId: payload.userId || null,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      address: payload.address,
      notes: payload.notes,
      paymentMethod: payload.paymentMethod || 'CASH',
      subtotal,
      deliveryFee,
      serviceCharge,
      tax,
      total,
      items: { create: lines },
    },
    include,
  });
};

export const list = ({ status, from, to, search, page = 1, pageSize = 20 } = {}) => {
  const where = {
    ...(status ? { status } : {}),
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
  await getById(id);
  return prisma.order.update({ where: { id }, data: { status }, include });
};
