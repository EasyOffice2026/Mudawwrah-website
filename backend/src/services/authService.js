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
  branchId: user.branchId ?? null,
});

// tenantId travels in the token so every request knows which restaurant this
// operator belongs to. Null marks a platform operator with access to all.
// branchId confines a BRANCH account to its branch's orders.
const sign = (user, expiresIn) =>
  jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name, tenantId: user.tenantId ?? null, branchId: user.branchId ?? null },
    config.jwtSecret,
    { expiresIn },
  );

/** The client's address, as Cloudflare or the proxy in front of us saw it. */
export const clientIp = (req) =>
  String(
    req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '',
  )
    .trim()
    .replace(/^::ffff:/, '');

/** The /64 network of an IPv6 address ("2a00:1851:10:48cf"), or null for anything else. */
const ipv6Network = (ip) => {
  const text = String(ip || '').toLowerCase().split('/')[0];
  if (!text.includes(':')) return null;
  const [head, tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  if (groups.length !== 8) return null;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':');
};

/**
 * Whether an address is on a branch's list. IPv4 must match exactly. IPv6 only
 * needs the same /64: a line gives every device its own address inside one
 * network, and that address changes by itself, so the exact value never holds.
 */
export const ipAllowed = (ip, allowed) => {
  const network = ipv6Network(ip);
  return allowed.some((entry) => (network ? ipv6Network(entry) === network : String(entry).trim() === ip));
};

/**
 * A branch account may only be used at its branch: the branch must exist and be
 * active, and when it lists static IPs the request must come from one of them.
 * Base client on purpose: login runs before any restaurant is in context.
 */
export const assertBranchAccess = async (user, ip) => {
  if (user.role !== 'BRANCH') return;
  if (!user.branchId) throw new HttpError(403, 'This branch account is not linked to a branch');
  const branch = await prisma.pickupLocation.findFirst({ where: { id: user.branchId, tenantId: user.tenantId }, select: { isActive: true, allowedIps: true } });
  if (!branch || !branch.isActive) throw new HttpError(403, 'This branch is not active');
  if (branch.allowedIps.length && !ipAllowed(ip, branch.allowedIps)) {
    // The address is logged so a branch whose line changed can be fixed from the log.
    console.warn(`[branch-access] refused ${user.email || user.branchId} from ${ip || 'unknown address'}`);
    throw new HttpError(403, 'This branch account can only be used from the branch itself');
  }
};

export const login = async ({ email, password }, { ip = '' } = {}) => {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { tenant: { select: { slug: true, nameEn: true } } },
  });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (!user.isActive) throw new HttpError(403, 'Account is deactivated');
  await assertBranchAccess(user, ip);
  return {
    token: sign(user, config.jwtExpiresIn),
    refreshToken: sign(user, config.refreshExpiresIn),
    user: { ...publicUser(user), tenantSlug: user.tenant?.slug ?? null },
  };
};

export const refresh = async (refreshToken, { ip = '' } = {}) => {
  if (!refreshToken) throw new HttpError(400, 'refreshToken is required');
  let payload;
  try {
    payload = jwt.verify(refreshToken, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw new HttpError(401, 'User no longer active');
  await assertBranchAccess(user, ip);
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
