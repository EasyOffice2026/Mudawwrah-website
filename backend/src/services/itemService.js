import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';

const include = {
  image: true,
  category: true,
  // Options carry their own thumbnails, which the item sheet renders beside
  // each name, so they have to be loaded with the option rows.
  options: { include: { image: true }, orderBy: { displayOrder: 'asc' } },
};

export const list = ({ categoryId, search, availableOnly, featuredOnly } = {}) =>
  prisma.menuItem.findMany({
    where: {
      ...(categoryId ? { categoryId } : {}),
      ...(availableOnly ? { isAvailable: true } : {}),
      ...(featuredOnly ? { isFeatured: true } : {}),
      ...(search
        ? {
            OR: [
              { nameEn: { contains: search, mode: 'insensitive' } },
              { nameAr: { contains: search, mode: 'insensitive' } },
              { descriptionEn: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include,
    orderBy: [{ categoryId: 'asc' }, { displayOrder: 'asc' }],
  });

export const getById = async (id) => {
  const item = await prisma.menuItem.findUnique({ where: { id }, include });
  if (!item) throw new HttpError(404, 'Menu item not found');
  return item;
};

export const create = async ({ options = [], ...data }) => {
  const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
  if (!category) throw new HttpError(400, 'categoryId does not reference an existing category');
  return prisma.menuItem.create({
    data: { ...data, options: { create: options } },
    include,
  });
};

export const update = async (id, { options, ...data }) => {
  await getById(id);
  if (data.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new HttpError(400, 'categoryId does not reference an existing category');
  }
  return prisma.$transaction(async (tx) => {
    if (options) {
      await tx.customizationOption.deleteMany({ where: { menuItemId: id } });
      await tx.customizationOption.createMany({ data: options.map((o) => ({ ...o, menuItemId: id })) });
    }
    return tx.menuItem.update({ where: { id }, data, include });
  });
};

export const remove = async (id) => {
  await getById(id);
  await prisma.menuItem.delete({ where: { id } });
};

export const reorder = async (orderedIds) => {
  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.menuItem.update({ where: { id }, data: { displayOrder: index } })),
  );
  return list();
};

export const bulkAvailability = async (ids, isAvailable) => {
  const result = await prisma.menuItem.updateMany({ where: { id: { in: ids } }, data: { isAvailable } });
  return { updated: result.count };
};

/**
 * Items other customers are actually ordering, for the cart's upsell rail.
 *
 * Ranked by quantity sold over a recent window rather than all time, so a
 * dish that sold well last winter does not outrank what is moving this week.
 * A restaurant with no trading history yet still needs something to show, so
 * the list is topped up from the menu's own featured and top-rated picks
 * before falling back to anything available.
 */
export const popular = async ({ limit = 8, excludeIds = [], windowDays = 30 } = {}) => {
  const tenantId = currentTenantId();
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const skip = new Set(excludeIds);

  // OrderItem has no tenantId of its own, so it is scoped through its order.
  const ranked = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: {
      menuItemId: { not: null },
      order: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: since } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: limit * 4,
  });

  const sellable = (item) => item && item.isAvailable && !item.isOutOfStock && !skip.has(item.id);

  const byId = new Map();
  if (ranked.length) {
    const items = await prisma.menuItem.findMany({
      where: { id: { in: ranked.map((r) => r.menuItemId) } },
      include,
    });
    for (const item of items) byId.set(item.id, item);
  }

  const picked = [];
  const takenNames = new Set();
  // The same drink often exists as separate rows in several categories.
  const push = (item) => {
    const name = item.nameEn.trim().toLowerCase();
    if (picked.length >= limit || takenNames.has(name) || !sellable(item)) return;
    takenNames.add(name);
    picked.push(item);
  };

  for (const row of ranked) push(byId.get(row.menuItemId));

  if (picked.length < limit) {
    const fillers = await prisma.menuItem.findMany({
      where: { isAvailable: true, isOutOfStock: false },
      include,
      orderBy: [{ isTopRated: 'desc' }, { isFeatured: 'desc' }, { displayOrder: 'asc' }],
      take: limit * 4,
    });
    for (const item of fillers) push(item);
  }

  return picked;
};
