import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';

/**
 * Items sold out at one branch only. A row is the flag: removing it puts the
 * item back on sale at that branch. Other branches keep selling it, and the
 * restaurant-wide switches on the menu item still apply everywhere.
 */

/** Menu item IDs sold out at this branch. */
export const listForBranch = async (branchId) =>
  (await prisma.branchSoldOut.findMany({ where: { branchId }, select: { menuItemId: true } })).map((row) => row.menuItemId);

export const set = async ({ branchId, menuItemId, soldOut }) => {
  const [branch, item] = await Promise.all([
    prisma.pickupLocation.findUnique({ where: { id: branchId }, select: { id: true } }),
    prisma.menuItem.findUnique({ where: { id: menuItemId }, select: { id: true } }),
  ]);
  if (!branch) throw new HttpError(400, 'That branch does not exist');
  if (!item) throw new HttpError(400, 'That menu item does not exist');

  const existing = await prisma.branchSoldOut.findFirst({ where: { branchId, menuItemId }, select: { id: true } });
  if (soldOut && !existing) await prisma.branchSoldOut.create({ data: { branchId, menuItemId } });
  if (!soldOut && existing) await prisma.branchSoldOut.delete({ where: { id: existing.id } });
  return { branchId, menuItemId, soldOut };
};

/** The first of these items sold out at the branch, or null. Used when an order is placed. */
export const firstSoldOut = async (branchId, menuItemIds) => {
  if (!branchId || !menuItemIds.length) return null;
  const row = await prisma.branchSoldOut.findFirst({
    where: { branchId, menuItemId: { in: menuItemIds } },
    include: { menuItem: { select: { nameEn: true } }, branch: { select: { nameEn: true } } },
  });
  return row ? { item: row.menuItem.nameEn, branch: row.branch.nameEn } : null;
};
