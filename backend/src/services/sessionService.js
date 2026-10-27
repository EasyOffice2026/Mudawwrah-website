import { prisma } from '../prisma.js';

/**
 * Ending sessions. A token is signed for a day (its renewal token for thirty), and nothing used to check it against
 * the account afterwards: a disabled account, a changed password or a stolen token kept working until it expired.
 *
 * Every token now carries the account's tokenVersion. Raising it ends every session of that account at once, and
 * a disabled or deleted account is refused too. What an account's version is, is remembered for a minute so this
 * costs one database read per account per minute, not one per request; this server forgets at once when it raises
 * a version itself.
 */
const REMEMBER_MS = 60_000;
const known = new Map();

const stateOf = async (userId, now = Date.now()) => {
  const hit = known.get(userId);
  if (hit && now - hit.at < REMEMBER_MS) return hit.state;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true, isActive: true } });
  const state = user ? { version: user.tokenVersion, active: user.isActive } : null;
  known.set(userId, { state, at: now });
  return state;
};

/** Whether a verified token's session is still on: the account exists, is active, and the version matches. */
export const sessionValid = async (payload) => {
  if (!payload?.sub) return false;
  const state = await stateOf(payload.sub);
  // Tokens from before versions existed carry none: they belong to version 0.
  return Boolean(state && state.active && (payload.tv ?? 0) === state.version);
};

/** Ends every session of an account (it signs in again with its password). */
export const endSessions = async (userId) => {
  await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  known.delete(userId);
};

/** For an account changed in another way here (disabled, removed): its state is read again on the next request. */
export const forget = (userId) => known.delete(userId);

export const forgetAll = () => known.clear();

/** Records an account's state as if just read (for tests that run without a database). */
export const remember = (userId, { version = 0, active = true } = {}) =>
  known.set(userId, { state: { version, active }, at: Date.now() });
