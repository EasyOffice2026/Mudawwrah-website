import bcrypt from 'bcryptjs';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';
import { issueSession } from './authService.js';
import * as locations from './driverLocations.js';
import { announce } from './orderEvents.js';
import * as orderService from './orderService.js';
import { isAwaitingPayment } from './orderVisibility.js';

/**
 * Delivery drivers.
 *
 * A driver is an account with the role DRIVER, made by the owner under Users with a name, a phone number and a
 * password. The order desk gives a delivery order to a driver; the driver's page (or the Android app, which shows
 * that page) lists the driver's own orders, and the driver presses "Start delivery" on leaving and "Delivered" at
 * the door. Between those two presses the phone reports where it is, which is what the customer's tracking page
 * shows. Outside a delivery the server takes no position at all, whatever the phone sends.
 */

const OUT = ['OUT_FOR_DELIVERY', 'REACHED'];
const FINISHED = ['DELIVERED', 'CANCELLED'];

// User is outside the automatic tenant scoping (see prisma.js), so every read here names the restaurant.
const driversOf = (tenantId) => ({ tenantId, role: 'DRIVER' });

/**
 * Signs a driver in with their phone number and password, on this restaurant's driver page. The same answer for a
 * wrong number and a wrong password, so the page cannot be used to find out which numbers are drivers.
 */
export const login = async ({ phone, password }) => {
  const tenantId = currentTenantId();
  const key = locations.phoneKey(phone);
  const drivers = key ? await prisma.user.findMany({ where: driversOf(tenantId) }) : [];
  const user = drivers.find((driver) => locations.phoneKey(driver.phone) === key);
  if (!user || !(await bcrypt.compare(password, user.password))) throw new HttpError(401, 'Wrong phone number or password');
  if (!user.isActive) throw new HttpError(403, 'This driver account is switched off. Please ask the restaurant.');
  return issueSession(user);
};

// What a driver sees of an order: where to go, who to hand it to, and what to collect. Nothing about other orders.
const driverOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  customerName: true,
  customerPhone: true,
  address: true,
  area: true,
  block: true,
  street: true,
  building: true,
  deliveryNote: true,
  notes: true,
  deliveryLat: true,
  deliveryLng: true,
  total: true,
  paymentMethod: true,
  paymentStatus: true,
  createdAt: true,
  readyAt: true,
  outForDeliveryAt: true,
  driverAssignedAt: true,
  items: { select: { id: true, nameEn: true, nameAr: true, quantity: true } },
  branch: { select: { id: true, nameEn: true, nameAr: true } },
};

const present = (order) => ({
  ...order,
  total: Number(order.total),
  deliveryLat: order.deliveryLat === null ? null : Number(order.deliveryLat),
  deliveryLng: order.deliveryLng === null ? null : Number(order.deliveryLng),
});

// Whether a driver has an order out right now, remembered briefly: the phone reports every few seconds.
const LIVE_CHECK_MS = 15_000;
const liveChecks = new Map();
const forgetLive = (driverId) => liveChecks.delete(driverId);
export const hasLiveDelivery = async (driverId, now = Date.now()) => {
  const hit = liveChecks.get(driverId);
  if (hit && now - hit.at < LIVE_CHECK_MS) return hit.live;
  const live = (await prisma.order.count({ where: { driverId, status: { in: OUT } } })) > 0;
  liveChecks.set(driverId, { live, at: now });
  return live;
};
export const forgetLiveChecks = () => liveChecks.clear();

/** The driver's own orders still to deliver (oldest first), and how many they delivered since midnight UTC+3. */
export const myOrders = async (driver) => {
  const dayStart = new Date(Math.floor((Date.now() + 3 * 3600_000) / 86_400_000) * 86_400_000 - 3 * 3600_000);
  const [active, deliveredToday] = await Promise.all([
    prisma.order.findMany({
      where: { driverId: driver.sub, status: { notIn: FINISHED }, paymentStatus: { not: 'PENDING' } },
      orderBy: { driverAssignedAt: 'asc' },
      select: driverOrderSelect,
    }),
    prisma.order.count({ where: { driverId: driver.sub, status: 'DELIVERED', deliveredAt: { gte: dayStart } } }),
  ]);
  return { orders: active.map(present), deliveredToday, tracking: active.some((order) => OUT.includes(order.status)) };
};

const myOrder = async (driver, orderId) => {
  const order = await prisma.order.findFirst({ where: { id: orderId, driverId: driver.sub } });
  // Someone else's order, or one taken off this driver, is simply not there.
  if (!order) throw new HttpError(404, 'This order is not on your list any more');
  if (isAwaitingPayment(order)) throw new HttpError(409, 'This order is waiting for its online payment');
  if (order.status === 'CANCELLED') throw new HttpError(409, 'This order was cancelled');
  return order;
};

const afterChange = async (driver) => {
  forgetLive(driver.sub);
  const mine = await myOrders(driver);
  // Nothing out any more: the driver's position is dropped at once, not left to grow old.
  if (!mine.tracking) locations.forget(driver.sub);
  return mine;
};

/** "Start delivery": the order is on its way, and from now the driver's phone is followed. */
export const start = async (driver, orderId) => {
  const order = await myOrder(driver, orderId);
  if (order.status === 'DELIVERED') throw new HttpError(409, 'This order is already delivered');
  if (!OUT.includes(order.status)) await orderService.updateStatus(order.id, 'OUT_FOR_DELIVERY');
  return afterChange(driver);
};

/** "Delivered": handed over at the door. */
export const delivered = async (driver, orderId) => {
  const order = await myOrder(driver, orderId);
  if (order.status !== 'DELIVERED') await orderService.updateStatus(order.id, 'DELIVERED');
  return afterChange(driver);
};

/**
 * The phone reports where it is. Kept only while the driver has an order out for delivery; at any other time it is
 * dropped unread and the answer tells the phone to stop sending.
 */
export const reportLocation = async (driver, body) => {
  if (!(await hasLiveDelivery(driver.sub))) {
    locations.forget(driver.sub);
    return { tracking: false };
  }
  const position = locations.readPosition(body);
  if (!position) throw new HttpError(400, 'That is not a position');
  locations.remember(driver.tenantId, driver.sub, position);
  return { tracking: true };
};

/**
 * The drivers the order desk can give a delivery to: every active driver for the owner and staff; for a branch
 * account its own drivers and those not tied to any branch. With how many deliveries each has in hand, and where
 * they are if they are out on one.
 */
export const listForDesk = async (viewer) => {
  const tenantId = currentTenantId();
  const drivers = await prisma.user.findMany({
    where: {
      ...driversOf(tenantId),
      isActive: true,
      ...(viewer?.role === 'BRANCH' ? { OR: [{ branchId: viewer.branchId || null }, { branchId: null }] } : {}),
    },
    select: { id: true, name: true, phone: true, branchId: true },
    orderBy: { name: 'asc' },
  });
  const inHand = await prisma.order.groupBy({
    by: ['driverId'],
    where: { driverId: { in: drivers.map((d) => d.id) }, status: { notIn: FINISHED } },
    _count: { _all: true },
  });
  return drivers.map((driver) => {
    const position = locations.lastKnown(tenantId, driver.id);
    return {
      ...driver,
      activeOrders: inHand.find((row) => row.driverId === driver.id)?._count._all || 0,
      location: position ? { lat: position.lat, lng: position.lng, at: new Date(position.at).toISOString(), fresh: position.fresh } : null,
    };
  });
};

/** The order desk gives a delivery to a driver, changes the driver, or (null) takes it back. */
export const assign = async (orderId, driverId, viewer = null) => {
  const order = await orderService.getById(orderId, viewer);
  if (order.orderType !== 'DELIVERY') throw new HttpError(409, 'Only a delivery order has a driver');
  if (driverId && FINISHED.includes(order.status)) throw new HttpError(409, 'This order is already finished');
  if (driverId) {
    const allowed = await listForDesk(viewer);
    if (!allowed.some((driver) => driver.id === driverId)) throw new HttpError(400, 'That driver is not available');
  }
  if ((order.driverId || null) === (driverId || null)) return order;
  await prisma.order.update({ where: { id: order.id }, data: { driverId: driverId || null, driverAssignedAt: driverId ? new Date() : null } });
  // The driver it was taken from may have nothing out any more.
  if (order.driverId) {
    forgetLive(order.driverId);
    if (!(await hasLiveDelivery(order.driverId))) locations.forget(order.driverId);
  }
  if (driverId) forgetLive(driverId);
  announce(order.tenantId, order.branchId);
  return orderService.getById(orderId, viewer);
};

/**
 * What the customer's tracking page shows of the delivery, only while the order is on its way: the driver's first
 * name, where they are (if their phone reported in the last two minutes), where the order is going (the pin the
 * customer dropped themselves) and about how long is left. Null at every other time.
 */
export const liveDelivery = async (order) => {
  if (!order?.driverId || !OUT.includes(order.status)) return null;
  const driver = await prisma.user.findFirst({ where: { id: order.driverId, tenantId: order.tenantId }, select: { name: true } });
  if (!driver) return null;
  const position = locations.lastKnown(order.tenantId, order.driverId);
  const destination =
    order.deliveryLat !== null && order.deliveryLng !== null ? { lat: Number(order.deliveryLat), lng: Number(order.deliveryLng) } : null;
  const live = position?.fresh ? position : null;
  return {
    driverName: String(driver.name || '').trim().split(/\s+/)[0] || null,
    location: live ? { lat: live.lat, lng: live.lng, heading: live.heading, at: new Date(live.at).toISOString() } : null,
    lastSeenAt: position ? new Date(position.at).toISOString() : null,
    destination,
    etaMinutes: live && destination ? locations.etaMinutes(live, destination) : null,
  };
};

/**
 * For the public tracking link, where the order is known only by its id: whether a driver has been given the order
 * (so the page can say a live map is coming), and the delivery itself once it is on its way.
 */
export const trackingOf = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { tenantId: true, driverId: true, status: true, deliveryLat: true, deliveryLng: true },
  });
  return { driverAssigned: Boolean(order?.driverId), delivery: await liveDelivery(order) };
};
