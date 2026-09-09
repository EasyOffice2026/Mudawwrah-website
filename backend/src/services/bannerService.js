import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';

const include = { image: true };

export const listPublic = () => {
  const now = new Date();
  return prisma.banner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    include,
    orderBy: { displayOrder: 'asc' },
  });
};

export const listAll = () => prisma.banner.findMany({ include, orderBy: { displayOrder: 'asc' } });

export const getById = async (id) => {
  const banner = await prisma.banner.findUnique({ where: { id }, include });
  if (!banner) throw new HttpError(404, 'Banner not found');
  return banner;
};

export const create = (data) => prisma.banner.create({ data, include });

export const update = async (id, data) => {
  await getById(id);
  return prisma.banner.update({ where: { id }, data, include });
};

export const remove = async (id) => {
  await getById(id);
  await prisma.banner.delete({ where: { id } });
};
