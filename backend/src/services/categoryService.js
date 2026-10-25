import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';

const slugify = (value) =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/(^-|-$)/g, '') || `category-${Date.now()}`;

const itemInclude = {
  // Option thumbnails travel with the menu, since the item sheet opens from
  // the category payload without a second request.
  include: { image: true, options: { include: { image: true }, orderBy: { displayOrder: 'asc' } } },
  orderBy: { displayOrder: 'asc' },
};

/** The "Picks for you" category, recognised by its slug ("picks-for-you", "top-picks", ...). */
const isPicks = (category) => /(^|-)picks?(-|$)/.test(category.slug);

export const listPublic = async () => {
  const categories = await prisma.category.findMany({
    where: { isVisible: true },
    orderBy: { displayOrder: 'asc' },
    include: {
      items: {
        ...itemInclude,
        where: { isAvailable: true },
      },
    },
  });

  // "Featured in picks" on an item in any category also shows it under Picks,
  // after the picks' own items. Picks often hold their own copy of an item
  // (same name, separate row), so a featured item already there by name is
  // not added twice.
  const picks = categories.find(isPicks);
  if (!picks) return categories;
  const names = new Set(picks.items.map((item) => item.nameEn.trim().toLowerCase()));
  const featured = [];
  for (const item of categories.filter((category) => category !== picks).flatMap((category) => category.items)) {
    const name = item.nameEn.trim().toLowerCase();
    if (!item.isFeatured || names.has(name)) continue;
    names.add(name);
    featured.push(item);
  }
  picks.items = [...picks.items, ...featured];
  return categories;
};

export const listAll = () =>
  prisma.category.findMany({
    orderBy: { displayOrder: 'asc' },
    include: { items: itemInclude, _count: { select: { items: true } } },
  });

export const getById = async (id) => {
  const category = await prisma.category.findUnique({ where: { id }, include: { items: itemInclude } });
  if (!category) throw new HttpError(404, 'Category not found');
  return category;
};

export const create = async (data) => {
  const slug = data.slug ? slugify(data.slug) : slugify(data.nameEn);
  // findFirst, not findUnique: slug is only unique within a tenant now.
  const exists = await prisma.category.findFirst({ where: { slug } });
  if (exists) throw new HttpError(409, `Category slug "${slug}" already exists`);
  return prisma.category.create({ data: { ...data, slug } });
};

export const update = async (id, data) => {
  await getById(id);
  const payload = { ...data };
  if (data.slug) payload.slug = slugify(data.slug);
  return prisma.category.update({ where: { id }, data: payload });
};

export const remove = async (id) => {
  await getById(id);
  await prisma.category.delete({ where: { id } });
};

export const reorder = async (orderedIds) => {
  // update() by id is not limited to this restaurant, so the list is checked against its own categories first.
  const owned = await prisma.category.findMany({ where: { id: { in: orderedIds } }, select: { id: true } });
  if (owned.length !== new Set(orderedIds).size) throw new HttpError(400, 'Unknown category in the list');
  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.category.update({ where: { id }, data: { displayOrder: index } })),
  );
  return listAll();
};
