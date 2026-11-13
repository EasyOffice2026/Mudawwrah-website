import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenant, currentTenantId } from '../tenantContext.js';
import { forget as forgetLocation, phoneKey } from './driverLocations.js';
import { endSessions, forget } from './sessionService.js';

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
  // A driver may deliver for one branch, or (no branch) for all of them.
  if (role === 'DRIVER' && !branchId) return { branchId: null };
  if (role !== 'BRANCH' && role !== 'DRIVER') return { branchId: null };
  if (!branchId) throw new HttpError(400, 'Choose the branch this account works at');
  const branch = await prisma.pickupLocation.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) throw new HttpError(400, 'That branch does not exist');
  return { branchId };
};

/**
 * A driver signs in with their phone number, so it must be there and no other driver of this restaurant may have
 * it. (Compared the way sign-in compares it: "+965 5000 1111" and "50001111" are one number.)
 */
const driverPhone = async (phone, exceptId = null) => {
  const key = phoneKey(phone);
  if (key.length < 7) throw new HttpError(400, 'A driver needs a phone number: it is what they sign in with');
  const others = await prisma.user.findMany({ where: { ...scope(), role: 'DRIVER', ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { phone: true } });
  if (others.some((other) => phoneKey(other.phone) === key)) throw new HttpError(409, 'Another driver already has this phone number');
};

// Every account has an email (it is how the others sign in). A driver has no use for one, so the owner is not
// asked for it: this stand-in is never shown, never emailed, and never clashes.
const driverEmail = () => `driver.${crypto.randomUUID().slice(0, 13)}@${currentTenant()?.slug || 'restaurant'}.drivers.local`;

export const create = async ({ email, password, branchId, ...rest }) => {
  if (rest.role === 'DRIVER') await driverPhone(rest.phone);
  else if (!email) throw new HttpError(400, 'Email is required');
  email = email || driverEmail();
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
  // `null` clears a driver's branch; left out, the branch stays as it is.
  const nextBranch = branchId !== undefined || rest.role ? await branchFields(role, branchId === undefined ? current.branchId : branchId) : {};
  if (role === 'DRIVER' && (rest.phone !== undefined || rest.role)) await driverPhone(rest.phone ?? current.phone, id);
  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...rest,
      ...nextBranch,
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      // A new password, or a disabled account, ends every session the account had: a stolen or shared token stops
      // working at once instead of at its expiry.
      ...(password || rest.isActive === false ? { tokenVersion: { increment: 1 } } : {}),
    },
    select,
  });
  forget(id);
  if (updated.role !== 'DRIVER' || !updated.isActive) forgetLocation(id);
  return updated;
};

export const remove = async (id) => {
  await getById(id);
  await prisma.user.delete({ where: { id } });
  forget(id);
  forgetLocation(id);
};

/** Ends every session of one of this restaurant's accounts (it signs in again with its password). */
export const signOut = async (id) => {
  await getById(id);
  await endSessions(id);
};
