import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';

const publicUser = (user) => ({
  id: user.id,
  tenantId: user.tenantId,
  email: user.email,
  name: user.name,
  phone: user.phone,
  role: user.role,
  isActive: user.isActive,
});

// tenantId travels in the token so every request knows which restaurant this
// operator belongs to. Null marks a platform operator with access to all.
const sign = (user, expiresIn) =>
  jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name, tenantId: user.tenantId ?? null },
    config.jwtSecret,
    { expiresIn },
  );

export const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { tenant: { select: { slug: true, nameEn: true } } },
  });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (!user.isActive) throw new HttpError(403, 'Account is deactivated');
  return {
    token: sign(user, config.jwtExpiresIn),
    refreshToken: sign(user, config.refreshExpiresIn),
    user: { ...publicUser(user), tenantSlug: user.tenant?.slug ?? null },
  };
};

export const refresh = async (refreshToken) => {
  if (!refreshToken) throw new HttpError(400, 'refreshToken is required');
  let payload;
  try {
    payload = jwt.verify(refreshToken, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw new HttpError(401, 'User no longer active');
  return { token: sign(user, config.jwtExpiresIn), user: publicUser(user) };
};

export const me = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: { select: { slug: true, nameEn: true } } },
  });
  if (!user) throw new HttpError(404, 'User not found');
  return { ...publicUser(user), tenantSlug: user.tenant?.slug ?? null };
};

export { publicUser };

/**
 * Signs a customer up for one restaurant.
 *
 * Role is fixed to CUSTOMER here rather than read from the request — this
 * endpoint is public, so anything the caller could influence about privilege
 * would be a way to mint a staff account. Tenant comes from the resolved
 * request, so a signup on one storefront cannot create a user on another.
 */
export const register = async ({ name, email, password, phone }) => {
  const tenantId = currentTenantId();
  if (!tenantId) throw new HttpError(400, 'No restaurant selected');

  const normalised = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalised } });
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  const user = await prisma.user.create({
    data: {
      tenantId,
      email: normalised,
      password: await bcrypt.hash(password, 10),
      name,
      phone: phone || null,
      role: 'CUSTOMER',
    },
  });

  return {
    token: sign(user, config.jwtExpiresIn),
    refreshToken: sign(user, config.refreshExpiresIn),
    user: publicUser(user),
  };
};
