import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';

const include = { image: true, category: true, options: { orderBy: { displayOrder: 'asc' } } };

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
