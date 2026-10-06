import bcrypt from 'bcryptjs';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';

const select = {
  id: true,
  tenantId: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  isActive: true,
  branchId: true,
  branch: { select: { id: true, nameEn: true, nameAr: true } },
  createdAt: true,
  _count: { select: { orders: true } },
};

// User is deliberately outside the automatic scoping (login must find a user
// before a tenant is known), so every query here filters explicitly.
const scope = () => ({ tenantId: currentTenantId() });

export const list = ({ role, search } = {}) =>
  prisma.user.findMany({
    where: {
      ...scope(),
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
  const user = await prisma.user.findFirst({
    where: { id, ...scope() },
    select: { ...select, orders: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!user) throw new HttpError(404, 'User not found');
  return user;
};

/**
 * A BRANCH account must name one of this restaurant's branches (tenant-scoped
 * read, so another restaurant's branch is not found); other roles carry none.
 */
const branchFields = async (role, branchId) => {
  if (role !== 'BRANCH') return { branchId: null };
  if (!branchId) throw new HttpError(400, 'Choose the branch this account works at');
  const branch = await prisma.pickupLocation.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) throw new HttpError(400, 'That branch does not exist');
  return { branchId };
};

export const create = async ({ email, password, branchId, ...rest }) => {
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) throw new HttpError(409, 'A user with this email already exists');
  return prisma.user.create({
    data: {
      ...rest,
      ...(await branchFields(rest.role, branchId)),
      ...scope(),
      email: email.toLowerCase(),
      password: await bcrypt.hash(password, 10),
    },
    select,
  });
};

export const update = async (id, { password, email, branchId, ...rest }) => {
  const current = await getById(id);
  const role = rest.role || current.role;
  const nextBranch = branchId !== undefined || rest.role ? await branchFields(role, branchId ?? current.branchId) : {};
  return prisma.user.update({
    where: { id },
    data: {
      ...rest,
      ...nextBranch,
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
