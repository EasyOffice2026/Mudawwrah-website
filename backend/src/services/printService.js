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

// The most copies one ticket can be waiting for, so a button pressed over and over does not empty the paper roll.
export const MAX_COPIES = 5;
const copiesOf = (value) => Math.min(MAX_COPIES, Math.max(1, Math.trunc(Number(value)) || 1));

/**
 * A station reports a ticket printed. Only an order of that station's own branch can be reported.
 *
 * The station says which request it printed (`queuedAt`, the ticket's print time when it fetched it) and how many
 * copies. If "Send to printer" was pressed again meanwhile, the print time has moved on: the ticket stays waiting,
 * owing only the copies not yet printed, so that copy still comes out. Older station pages send neither, and the
 * ticket is simply done.
 */
export const markPrinted = async (branchId, orderId, { queuedAt, copies } = {}) => {
  const order = await prisma.order.findFirst({ where: { id: orderId, ...forBranch(branchId) }, select: { id: true } });
  if (!order) throw new HttpError(404, 'That order does not belong to this printer');
  const count = copiesOf(copies);
  const asked = queuedAt ? new Date(queuedAt) : null;
  const sameRequest = asked && !Number.isNaN(asked.getTime()) ? { printQueuedAt: asked } : {};
  const finished = await prisma.order.updateMany({
    where: { id: order.id, ...sameRequest },
    data: { printedAt: new Date(), printCopies: 1, printCount: { increment: count } },
  });
  if (!finished.count) {
    await prisma.$executeRaw`UPDATE "Order" SET "printCount" = "printCount" + ${count}, "printCopies" = GREATEST(1, "printCopies" - ${count}) WHERE "id" = ${order.id}`;
  }
  return prisma.order.findUnique({ where: { id: order.id }, select: { id: true, printedAt: true, printCount: true } });
};

/**
 * Sends a ticket to the station again (paper jam, lost ticket, a second copy). Branch accounts can only do their
 * own. Pressed again while the ticket is still waiting (or printing), it adds a copy rather than being lost.
 */
export const reprint = async (orderId, viewer = null) => {
  const order = await orderService.getById(orderId, viewer);
  const select = { id: true, orderNumber: true, printQueuedAt: true, printCopies: true };
  const now = new Date();
  if (order.printQueuedAt && !order.printedAt) {
    if (order.printCopies >= MAX_COPIES) return prisma.order.findUnique({ where: { id: order.id }, select });
    const added = await prisma.order.updateMany({
      where: { id: order.id, printedAt: null },
      data: { printQueuedAt: now, printCopies: { increment: 1 } },
    });
    if (added.count) return prisma.order.findUnique({ where: { id: order.id }, select });
  }
  return prisma.order.update({ where: { id: order.id }, data: { printQueuedAt: now, printedAt: null, printCopies: 1 }, select });
};

/**
 * Every station's link, how many tickets it has waiting, and when it last printed. The owner and staff see every
 * branch; a branch account sees only its own, so each branch sets up its printer without an owner's login.
 */
export const stations = async (viewer = null) => {
  const tenantId = currentTenantId();
  const ownBranchOnly = viewer?.role === 'BRANCH';
  const branches = await prisma.pickupLocation.findMany({
    where: ownBranchOnly ? { id: viewer.branchId ?? '' } : undefined,
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, nameEn: true, nameAr: true, isActive: true },
  });
  const rows = [
    ...branches.map(({ id, nameEn, nameAr, isActive }) => ({ id, nameEn, nameAr, isActive })),
    ...(ownBranchOnly ? [] : [{ id: UNASSIGNED, nameEn: 'Orders without a branch', nameAr: 'طلبات بدون فرع', isActive: true }]),
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
