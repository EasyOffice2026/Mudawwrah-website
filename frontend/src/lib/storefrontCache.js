/**
 * What this phone last saw of a restaurant's menu, kept so that coming back to it, or pressing the
 * back button, shows the menu at once while the latest is fetched quietly behind it. Without this
 * every visit and every return from a policy page started from grey loading boxes for several seconds.
 *
 * The server still decides everything that matters: prices, availability and totals are checked when
 * an order is placed, so a menu a few seconds stale can never cost a customer anything.
 */
const PREFIX = 'mdawra_sf:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const memory = new Map();

const storage = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

const slotOf = (slug, path) => `${slug}:${path}`;

export const remember = (slug, path, data, at = Date.now()) => {
  const entry = { at, data };
  memory.set(slotOf(slug, path), entry);
  try {
    storage()?.setItem(PREFIX + slotOf(slug, path), JSON.stringify(entry));
  } catch {
    /* storage full or blocked: the copy in memory is enough for this visit */
  }
};

export const peek = (slug, path, now = Date.now()) => {
  if (!slug) return null;
  const slot = slotOf(slug, path);
  let entry = memory.get(slot);
  if (!entry) {
    try {
      const raw = storage()?.getItem(PREFIX + slot);
      entry = raw ? JSON.parse(raw) : null;
    } catch {
      entry = null;
    }
    if (entry) memory.set(slot, entry);
  }
  if (!entry || typeof entry.at !== 'number' || now - entry.at > MAX_AGE_MS) return null;
  return entry.data ?? null;
};

/** The four things a menu page needs, or null if any is missing (the page then loads as it always did). */
export const recall = (slug) => {
  const tenant = peek(slug, '/tenants/current');
  const categories = peek(slug, '/categories');
  const settings = peek(slug, '/settings');
  const promotions = peek(slug, '/promotions');
  return tenant && categories && settings && promotions ? { tenant, categories, settings, promotions } : null;
};

/** Keeps the object already on screen when the fresh copy is identical, so nothing re-renders for nothing. */
export const keepIfSame = (previous, next) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next);

/** For tests: forget the copy in memory (the stored copy is separate). */
export const forgetMemory = () => memory.clear();
