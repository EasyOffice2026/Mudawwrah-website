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

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'Insufficient permissions'));
  next();
};

export const requireStaff = [authenticate, requireRole('ADMIN', 'STAFF')];
export const requireAdmin = [authenticate, requireRole('ADMIN')];
