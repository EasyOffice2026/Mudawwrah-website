import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './error.js';

export const authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Authentication required'));
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
};

/**
 * Attaches req.user when a valid token is present and carries on regardless.
 *
 * Ordering is open to guests, but a signed-in customer's order has to be tied
 * to them so it shows up in their history. The user id comes from the token
 * here, never from the request body — otherwise anyone could file an order
 * against someone else's account.
 */
export const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret);
    } catch {
      // An expired token should not stop a guest checkout.
    }
  }
  next();
};

/** Signed-in customers, for their own order history. */
export const requireCustomer = [
  authenticate,
  (req, res, next) => {
    if (!req.user?.sub) return next(new HttpError(401, 'Authentication required'));
    next();
  },
];

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Insufficient permissions'));
  next();
};

/**
 * Staff belong to one restaurant and may only administer that one. Users with
 * no tenantId are platform operators (the reseller) and may administer any —
 * which is how a restaurant can either self-manage or hand it over to us.
 */
export const requireTenantAccess = (req, res, next) => {
  const userTenantId = req.user?.tenantId ?? null;
  if (userTenantId === null) return next();
  if (!req.tenant || req.tenant.id !== userTenantId) {
    return next(new HttpError(403, 'You do not have access to this restaurant'));
  }
  next();
};

export const requirePlatformAdmin = (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (req.user.tenantId != null || req.user.role !== 'ADMIN') {
    return next(new HttpError(403, 'Platform administrator only'));
  }
  next();
};

export const requireStaff = [authenticate, requireRole('ADMIN', 'STAFF'), requireTenantAccess];
export const requireAdmin = [authenticate, requireRole('ADMIN'), requireTenantAccess];
