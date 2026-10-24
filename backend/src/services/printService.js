import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';
import * as orderService from './orderService.js';

/**
 * Automatic printing. Each branch has a computer with the thermal printer attached; that computer keeps
 * one page open (the print station) which asks here for tickets that are waiting and prints them.
 *
 * An order is "waiting" from the moment it is printable until a station says it printed it:
 * - an ordinary order is printable when it is placed;
 * - an order paid online is printable when the payment is confirmed, never before (see payment/index.js).
 * Orders from before this existed have no print time, so switching it on never reprints old orders.
 */
export const UNASSIGNED = 'unassigned';

/**
 * A station's private key. It is derived from the server secret rather than stored, so there is nothing to
 * set up or leak from the database; it never expires, so an unattended computer is never logged out.
 * Changing JWT_SECRET changes every key (and logs everyone out), which is also how to revoke them.
 */
export const printKeyFor = (tenantId, branchId) =>
  crypto.createHmac('sha256', config.jwtSecret).update(`print:${tenantId}:${branchId}`).digest('base64url').slice(0, 32);

export const keyMatches = (tenantId, branchId, key) => {
  const expected = Buffer.from(printKeyFor(tenantId, branchId));
  const given = Buffer.from(String(key || ''));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

const forBranch = (branchId) => (branchId === UNASSIGNED ? { branchId: null } : { branchId });
const waiting = { printQueuedAt: { not: null }, printedAt: null, status: { not: 'CANCELLED' } };

/** The tickets a station should print now, oldest first, with everything the ticket shows. */
export const jobs = (branchId) =>
  prisma.order.findMany({
    where: { ...forBranch(branchId), ...waiting },
    orderBy: { printQueuedAt: 'asc' },
    take: 5,
    include: {
      items: true,
      pickupLocation: { select: { id: true, nameEn: true, nameAr: true } },
      branch: { select: { id: true, nameEn: true, nameAr: true } },
      zone: { select: { id: true, nameEn: true, nameAr: true } },
    },
  });

/** A station reports a ticket printed. Only an order of that station's own branch can be reported. */
export const markPrinted = async (branchId, orderId) => {
  const order = await prisma.order.findFirst({ where: { id: orderId, ...forBranch(branchId) }, select: { id: true, printCount: true } });
  if (!order) throw new HttpError(404, 'That order does not belong to this printer');
  return prisma.order.update({
    where: { id: order.id },
    data: { printedAt: new Date(), printCount: order.printCount + 1 },
    select: { id: true, printedAt: true, printCount: true },
  });
};

/** Sends a ticket to the station again (paper jam, lost ticket). Branch accounts can only do their own. */
export const reprint = async (orderId, viewer = null) => {
  const order = await orderService.getById(orderId, viewer);
  return prisma.order.update({
    where: { id: order.id },
    data: { printQueuedAt: new Date(), printedAt: null },
    select: { id: true, orderNumber: true, printQueuedAt: true },
  });
};

/** For the owner: every station's link, how many tickets it has waiting, and when it last printed. */
export const stations = async () => {
  const tenantId = currentTenantId();
  const branches = await prisma.pickupLocation.findMany({
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, nameEn: true, nameAr: true, isActive: true },
  });
  const rows = [
    ...branches.map(({ id, nameEn, nameAr, isActive }) => ({ id, nameEn, nameAr, isActive })),
    { id: UNASSIGNED, nameEn: 'Orders without a branch', nameAr: 'طلبات بدون فرع', isActive: true },
  ];
  const result = [];
  for (const row of rows) {
    const [count, last] = await Promise.all([
      prisma.order.count({ where: { ...forBranch(row.id), ...waiting } }),
      prisma.order.findFirst({
        where: { ...forBranch(row.id), printedAt: { not: null } },
        orderBy: { printedAt: 'desc' },
        select: { orderNumber: true, printedAt: true },
      }),
    ]);
    result.push({ ...row, key: printKeyFor(tenantId, row.id), waiting: count, lastPrinted: last });
  }
  return result;
};
