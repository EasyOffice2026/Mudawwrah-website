import { clientIp } from '../services/authService.js';
import { HttpError } from './error.js';

/**
 * Caps how often one address may call an endpoint: password guessing on sign-in, fake orders that would ring the
 * branches and print in the kitchen, promo codes guessed one after another.
 *
 * Counted in memory, which is exact for the one server this runs on; a restart starts the counts again, which is
 * harmless. Limits are generous on purpose: Kuwaiti mobile networks put many customers behind one address.
 */
export const createRateLimit = ({ windowMs, max, name, now = Date.now }) => {
  const hits = new Map();
  let sweptAt = now();

  return (req, res, next) => {
    const at = now();
    // Forget windows that have ended, now and then, so the map never grows without bound.
    if (at - sweptAt > windowMs) {
      for (const [key, entry] of hits) if (at - entry.start >= windowMs) hits.delete(key);
      sweptAt = at;
    }
    const key = clientIp(req) || 'unknown';
    const entry = hits.get(key);
    if (!entry || at - entry.start >= windowMs) {
      hits.set(key, { start: at, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count <= max) return next();
    const wait = Math.ceil((entry.start + windowMs - at) / 1000);
    res.set('Retry-After', String(wait));
    console.warn(`[rate-limit] ${name}: ${key} refused (${entry.count} in ${Math.round(windowMs / 60000)} min)`);
    return next(new HttpError(429, `Too many attempts. Please wait ${Math.ceil(wait / 60)} minute(s) and try again.`));
  };
};

// Sign-in (staff, branches and the platform owner share it) and customer sign-up.
export const loginLimit = createRateLimit({ name: 'login', windowMs: 15 * 60_000, max: 20 });
// Renewing a sign-in: every open dashboard does it on its own, so it gets its own, wider count.
export const refreshLimit = createRateLimit({ name: 'refresh', windowMs: 15 * 60_000, max: 120 });
// Placing orders: far above what one household orders, far below a flood.
export const orderLimit = createRateLimit({ name: 'orders', windowMs: 10 * 60_000, max: 60 });
// Browsers reporting what the website's Content-Security-Policy would block.
export const cspLimit = createRateLimit({ name: 'csp', windowMs: 60_000, max: 30 });
// Trying promo codes.
export const promoLimit = createRateLimit({ name: 'promo', windowMs: 10 * 60_000, max: 30 });
