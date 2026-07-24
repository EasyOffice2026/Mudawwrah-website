import bcrypt from 'bcryptjs';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';

const select = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  _count: { select: { orders: true } },
};

export const list = ({ role, search } = {}) =>
  prisma.user.findMany({
    where: {
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select,
    orderBy: { createdAt: 'desc' },
  });

export const getById = async (id) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { ...select, orders: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!user) throw new HttpError(404, 'User not found');
  return user;
};

export const create = async ({ email, password, ...rest }) => {
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) throw new HttpError(409, 'A user with this email already exists');
  return prisma.user.create({
    data: { ...rest, email: email.toLowerCase(), password: await bcrypt.hash(password, 10) },
    select,
  });
};

export const update = async (id, { password, email, ...rest }) => {
  await getById(id);
  return prisma.user.update({
    where: { id },
    data: {
      ...rest,
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
    },
    select,
  });
};

export const remove = async (id) => {
  await getById(id);
  await prisma.user.delete({ where: { id } });
};
