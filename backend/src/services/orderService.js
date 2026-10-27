import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenant } from '../tenantContext.js';
import { resolve as resolvePromotion } from './promotionService.js';
import { getAll as getSettings } from './settingService.js';
import { pushIfDue as pushToFoodics } from './foodicsService.js';
import { nextOrderNumber } from './orderNumber.js';
import { statusStamp } from './statusTimes.js';
import { isOpenAt, nextOpening } from './branchHours.js';
import { resolveForDelivery } from './zoneService.js';
import { firstSoldOut } from './soldOutService.js';
import { notifyNewOrder, notifyStatusChange } from './whatsapp/notifications.js';
import { createdAtWindow } from './orderDates.js';
import { announce } from './orderEvents.js';
import { arrivedAfter, hiddenWhileUnpaid, isAwaitingPayment } from './orderVisibility.js';
import { isOnlinePaymentEnabled } from './payment/index.js';

const include = {
  items: { include: { menuItem: true } },
  user: { select: { id: true, name: true, email: true } },
  feedback: true,
  // Named rather than only referenced, so the kitchen sees which branch is
  // collecting without a second lookup. Null once a branch is retired.
  pickupLocation: { select: { id: true, nameEn: true, nameAr: true, addressEn: true, addressAr: true } },
  // The branch handling the order (pickup or delivery) and the delivery zone it matched.
  branch: { select: { id: true, nameEn: true, nameAr: true } },
  zone: { select: { id: true, nameEn: true, nameAr: true } },
};

/** Branch staff only ever see their own branch's orders; a branch account without a branch sees none. */
const viewerScope = (viewer) => (viewer?.role === 'BRANCH' ? { branchId: viewer.branchId || '00000000-0000-0000-0000-000000000000' } : {});

const round3 = (value) => Number(Number(value).toFixed(3));

// What a newly placed order is answered with: its lines and the branch handling it. The confirmation page, the
// payment page, WhatsApp and Foodics read nothing else, and every further relation is one more database round
// trip while the customer watches "Saving…".
const placedInclude = { items: true, branch: include.branch };

/**
 * "Order via WhatsApp" hands an order over unpaid and straight to the kitchen. Where this customer must pay online,
 * it would be a way round paying (the checkout hides the button as well).
 */
export const skipsPayment = (payload) =>
  (payload.channel || 'WEB') === 'WEB' && payload.paymentMethod === 'WHATSAPP' && isOnlinePaymentEnabled(payload.customerPhone);

export const create = async (payload) => {
  if (skipsPayment(payload)) {
    throw new HttpError(409, 'Please choose a payment method and pay online to place your order.');
  }

  // Independent reads go out together: the database is a long round trip away, and the customer waits on each one.
  // An option is only used below when it belongs to an item found in this restaurant's menu.
  const ids = payload.items.map((i) => i.menuItemId);
  const [settings, menuItems, options] = await Promise.all([
    getSettings(),
    prisma.menuItem.findMany({ where: { id: { in: ids } } }),
    prisma.customizationOption.findMany({ where: { menuItemId: { in: ids } } }),
  ]);
  if (settings.isOpen !== 'true') throw new HttpError(409, 'The restaurant is currently closed for orders');

  // The website hides payment methods the restaurant has switched off; this
  // makes the server agree, so one can't be used by calling the API directly.
  // "Order via WhatsApp" (WHATSAPP) hands the order over rather than paying
  // for it, and the WhatsApp bot (channel WHATSAPP) has its own payment step.
  // An order that names no method takes the restaurant's first accepted one —
  // never cash by default, which a restaurant may have switched off.
  const accepted = String(settings.paymentMethods || 'KNET,CARD')
    .split(',')
    .map((method) => method.trim())
    .filter(Boolean);
  const isWeb = (payload.channel || 'WEB') === 'WEB';
  const paymentMethod = payload.paymentMethod || (isWeb && accepted[0]) || 'CASH';
  if (isWeb && paymentMethod !== 'WHATSAPP' && !accepted.includes(paymentMethod)) {
    throw new HttpError(400, `${paymentMethod} is not accepted by this restaurant`);
  }

  // A website order paid with KNET or a card goes to the payment page when a gateway is set up:
  // it waits as PENDING, and reaches the kitchen and the staff only once it is paid.
  const payOnline =
    isWeb && ['KNET', 'CARD', 'APPLE_PAY'].includes(paymentMethod) && isOnlinePaymentEnabled(payload.customerPhone);

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

  const orderType = payload.orderType === 'PICKUP' ? 'PICKUP' : 'DELIVERY';
  if (orderType === 'PICKUP' && settings.pickupEnabled !== 'true') {
    throw new HttpError(409, 'This restaurant is not accepting pickup orders');
  }
  if (orderType === 'DELIVERY' && settings.deliveryEnabled !== 'true') {
    throw new HttpError(409, 'This restaurant is not accepting delivery orders');
  }
  const timezone = settings.timezone || 'Asia/Kuwait';

  // Which branch handles the order. Pickup: the branch chosen. Delivery: the
  // branch of the zone the address is in. Either must be open right now; an
  // uncovered area or a closed branch is refused, never re-routed (client's choice).
  let branchId = null;
  let zone = null;
  if (orderType === 'PICKUP' && payload.pickupLocationId) {
    // A branch id arrives from the client, and a foreign key alone would happily
    // accept another restaurant's branch. This read is tenant-scoped, so a
    // branch belonging to anyone else simply is not found.
    const branch = await prisma.pickupLocation.findUnique({
      where: { id: payload.pickupLocationId },
      select: { id: true, isActive: true, nameEn: true, hours: true },
    });
    if (!branch) throw new HttpError(400, 'That pickup location does not exist');
    if (!branch.isActive) throw new HttpError(409, 'That pickup location is not taking orders');
    if (!isOpenAt(branch.hours, new Date(), timezone)) {
      const next = nextOpening(branch.hours, new Date(), timezone);
      throw new HttpError(409, `Our ${branch.nameEn} branch is closed right now.${next ? ` It opens at ${next.time}${next.daysAhead ? ' (another day)' : ''}.` : ''}`);
    }
    branchId = branch.id;
  } else if (orderType === 'PICKUP' && (await prisma.pickupLocation.count({ where: { isActive: true } }))) {
    throw new HttpError(422, 'Please choose the branch you will pick up from');
  }
  if (orderType === 'DELIVERY') {
    zone = await resolveForDelivery({ zoneId: payload.zoneId, area: payload.area }, { timezone });
    if (zone) branchId = zone.branchId;
  }

  // Collecting in person is never charged for delivery, and carries no address.
  let deliveryFee = orderType === 'PICKUP' ? 0 : round3(zone?.deliveryFee ?? settings.deliveryFee);

  // The sold-out check and the voucher (re-resolved from the database; the client only sends a code) are read
  // together, but still judged in the order the customer is told about them: sold out, minimum, then the code.
  const soldOutCheck = firstSoldOut(branchId, lines.map((l) => l.menuItemId));
  const promoCheck = resolvePromotion(payload.promoCode, subtotal, deliveryFee);
  promoCheck.catch(() => {}); // judged below; never an unhandled rejection when an earlier check fails first

  const soldOut = await soldOutCheck;
  if (soldOut) throw new HttpError(409, `${soldOut.item} is sold out at our ${soldOut.branch} branch right now`);

  const minimumOrder = zone?.minimumOrder ?? Number(settings.minimumOrder);
  if (subtotal < minimumOrder) {
    throw new HttpError(422, `Minimum order value is KWD ${Number(minimumOrder).toFixed(3)}`);
  }

  const { promotion, discount, freeDelivery } = await promoCheck;
  if (freeDelivery) deliveryFee = 0;

  const discountedSubtotal = round3(subtotal - discount);
  const serviceCharge = round3((discountedSubtotal * Number(settings.serviceChargePercent)) / 100);
  // taxPercent was previously editable in admin but never applied to a total.
  const tax = round3(((discountedSubtotal + serviceCharge) * Number(settings.taxPercent || 0)) / 100);
  const tip = orderType === 'PICKUP' ? 0 : Math.max(0, round3(payload.tip || 0));
  const total = round3(discountedSubtotal + deliveryFee + serviceCharge + tax + tip);

  const order = await prisma.order.create({
    data: {
      orderNumber: await nextOrderNumber({ tenant: currentTenant(), branchId, timeZone: timezone }),
      userId: payload.userId || null,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      // Pickup carries no address at all, so the structured parts the WhatsApp
      // flow collects are dropped alongside the composed line.
      address: orderType === 'PICKUP' ? null : payload.address,
      // The zone's own name when one matched, so every order of an area reads the same in the dashboard.
      area: orderType === 'PICKUP' ? null : zone?.nameEn || payload.area || null,
      block: orderType === 'PICKUP' ? null : payload.block || null,
      street: orderType === 'PICKUP' ? null : payload.street || null,
      building: orderType === 'PICKUP' ? null : payload.building || null,
      deliveryLat: orderType === 'PICKUP' ? null : payload.deliveryLat ?? null,
      deliveryLng: orderType === 'PICKUP' ? null : payload.deliveryLng ?? null,
      notes: payload.notes,
      channel: payload.channel || 'WEB',
      paymentMethod,
      ...(payOnline ? { paymentStatus: 'PENDING' } : {}),
      // Printable at once, unless it waits for an online payment: that one prints when it is paid.
      ...(payOnline ? {} : { printQueuedAt: new Date() }),
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
      branchId,
      zoneId: zone?.id || null,
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
    include: placedInclude,
  });
  // Fire-and-forget: a slow or failed WhatsApp call must never delay the
  // order confirmation the customer is waiting on.
  if (!payOnline) {
    announce(order.tenantId, order.branchId);
    notifyNewOrder(order, settings).catch((error) => console.error('[whatsapp] new-order notification failed', error));
  }
  pushToFoodics(order);
  return order;
};

/** An order whose payment page could not be opened: nothing was charged, and it never reaches the kitchen. */
export const cancelUnpaid = (id) =>
  prisma.order.update({
    where: { id },
    data: { status: 'CANCELLED', paymentStatus: 'FAILED', ...statusStamp({}, 'CANCELLED') },
  });

/**
 * What the admin polls every few seconds to notice new orders without
 * reloading anything: the latest orders in a few fields each, how many arrived
 * since the viewer last looked, and a version that moves whenever any order is
 * added or changes status — so a page only refetches when something changed.
 * A branch account sees only its own branch, exactly as in the order list.
 */
// Orders still waiting to be accepted count for a day, so yesterday's forgotten ones do not ring for ever.
const WAITING_WINDOW_MS = 24 * 3600 * 1000;

// An order nobody has accepted after this long is late, for the outside monitor below.
export const LATE_AFTER_MS = 15 * 60 * 1000;

/**
 * How many of this restaurant's orders have waited too long to be accepted: for an uptime monitor that alerts the
 * owner by email or SMS, since an unattended order desk once went unnoticed for two days. An online order counts
 * from when it was paid; one still waiting for its payment is not the kitchen's yet.
 */
export const lateOrders = (now = Date.now()) => {
  const cutoff = new Date(now - LATE_AFTER_MS);
  return prisma.order.count({
    where: {
      ...hiddenWhileUnpaid,
      status: 'PENDING',
      createdAt: { gt: new Date(now - WAITING_WINDOW_MS) },
      OR: [{ paidAt: null, createdAt: { lt: cutoff } }, { paidAt: { lt: cutoff } }],
    },
  });
};

export const feed = async ({ since } = {}, viewer = null) => {
  const scope = { ...viewerScope(viewer), ...hiddenWhileUnpaid };
  const [orders, latest, unseen, waitingRows] = await Promise.all([
    prisma.order.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        total: true,
        status: true,
        orderType: true,
        channel: true,
        createdAt: true,
        branch: { select: { nameEn: true, nameAr: true } },
      },
    }),
    prisma.order.aggregate({ where: scope, _max: { updatedAt: true } }),
    since ? prisma.order.count({ where: { ...scope, ...arrivedAfter(since) } }) : 0,
    prisma.order.groupBy({
      by: ['branchId'],
      where: { ...scope, status: 'PENDING', createdAt: { gt: new Date(Date.now() - WAITING_WINDOW_MS) } },
      _count: { _all: true },
      _min: { createdAt: true },
    }),
  ]);
  const waiting = {
    count: waitingRows.reduce((sum, row) => sum + row._count._all, 0),
    oldestAt: waitingRows.reduce((oldest, row) => (!oldest || row._min.createdAt < oldest ? row._min.createdAt : oldest), null),
  };
  // The owner also sees which branch is sitting on them; a branch account only ever sees its own.
  let waitingByBranch;
  if (viewer?.role !== 'BRANCH' && waitingRows.length) {
    const names = await prisma.pickupLocation.findMany({
      where: { id: { in: waitingRows.map((row) => row.branchId).filter(Boolean) } },
      select: { id: true, nameEn: true, nameAr: true },
    });
    waitingByBranch = waitingRows.map((row) => ({
      branchId: row.branchId,
      nameEn: names.find((n) => n.id === row.branchId)?.nameEn || null,
      nameAr: names.find((n) => n.id === row.branchId)?.nameAr || null,
      count: row._count._all,
      oldestAt: row._min.createdAt,
    }));
  }
  return { orders, unseen, version: latest._max.updatedAt, now: new Date(), waiting, ...(waitingByBranch ? { waitingByBranch } : {}) };
};

export const list = async ({ status, channel, from, to, search, branchId, page = 1, pageSize = 20 } = {}, viewer = null) => {
  // The restaurant's own timezone decides where a chosen day begins and ends (only looked up when dates are used).
  const timeZone = from || to ? (await getSettings()).timezone || 'Asia/Kuwait' : null;
  const where = {
    // An order still waiting for its online payment is not shown until it is paid.
    ...hiddenWhileUnpaid,
    ...(branchId ? { branchId } : {}),
    // After the filter above, so a branch account cannot widen its own view.
    ...viewerScope(viewer),
    ...(status ? { status } : {}),
    ...(channel ? { channel } : {}),
    ...(from || to ? { createdAt: createdAtWindow(from, to, timeZone) } : {}),
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
        // One query for the orders and everything shown with them, not one per relation.
        relationLoadStrategy: 'join',
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(pageSize),
        take: Number(pageSize),
      }),
    ]);
    return { data, total, page: Number(page), pageSize: Number(pageSize) };
  });
};

export const getById = async (id, viewer = null) => {
  const order = await prisma.order.findUnique({ where: { id }, include, relationLoadStrategy: 'join' });
  // Another branch's order is reported as not found rather than forbidden: no hint it exists.
  if (!order || (viewer?.role === 'BRANCH' && order.branchId !== viewer.branchId)) throw new HttpError(404, 'Order not found');
  return order;
};

export const updateStatus = async (id, status, viewer = null, { cancelReason, cancelNote } = {}) => {
  const current = await getById(id, viewer);
  // Until the gateway confirms the money, the order is not the restaurant's to confirm or cancel.
  if (isAwaitingPayment(current)) throw new HttpError(409, 'This order is waiting for its online payment');
  if (current.status === status) return current;
  const restored = current.status === 'CANCELLED' && status !== 'CANCELLED';
  const order = await prisma.order.update({
    where: { id },
    data: {
      status,
      ...statusStamp(current, status),
      ...(status === 'CANCELLED' ? { cancelReason: cancelReason || null, cancelNote: cancelNote || null } : {}),
      // A restored order isn't cancelled any more; a later cancellation records afresh.
      ...(restored ? { cancelReason: null, cancelNote: null, cancelledAt: null } : {}),
    },
    include,
  });
  // A WhatsApp hiccup is not worth failing an admin's status update over —
  // the change has already been saved above by the time this runs.
  announce(order.tenantId, order.branchId);
  await notifyStatusChange(order).catch((error) => console.error('[whatsapp] status notification failed', error));
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
