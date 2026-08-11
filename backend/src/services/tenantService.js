import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';

const publicFields = {
  id: true,
  slug: true,
  nameEn: true,
  nameAr: true,
  taglineEn: true,
  taglineAr: true,
  cuisineEn: true,
  cuisineAr: true,
  brandColor: true,
  brandDark: true,
  brandLight: true,
  accentColor: true,
  currency: true,
  country: true,
};

/** Powers the platform landing page that lists every restaurant. */
export const listPublic = () =>
  prisma.tenant.findMany({
    where: { isActive: true },
    select: { ...publicFields, _count: { select: { items: true, categories: true } } },
    orderBy: { createdAt: 'asc' },
  });

export const getBySlug = async (slug) => {
  const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true }, select: publicFields });
  if (!tenant) throw new HttpError(404, 'Restaurant not found');
  return tenant;
};

export const listAll = () => prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });

export const create = async (data) => {
  const exists = await prisma.tenant.findUnique({ where: { slug: data.slug } });
  if (exists) throw new HttpError(409, `A restaurant with slug "${data.slug}" already exists`);
  return prisma.tenant.create({ data });
};

export const update = async (id, data) => {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new HttpError(404, 'Restaurant not found');
  return prisma.tenant.update({ where: { id }, data });
};
