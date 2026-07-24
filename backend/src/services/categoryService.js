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
  include: { image: true, options: { orderBy: { displayOrder: 'asc' } } },
  orderBy: { displayOrder: 'asc' },
};

export const listPublic = () =>
  prisma.category.findMany({
    where: { isVisible: true },
    orderBy: { displayOrder: 'asc' },
    include: {
      items: {
        ...itemInclude,
        where: { isAvailable: true },
      },
    },
  });

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
  const exists = await prisma.category.findUnique({ where: { slug } });
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
  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.category.update({ where: { id }, data: { displayOrder: index } })),
  );
  return listAll();
};
