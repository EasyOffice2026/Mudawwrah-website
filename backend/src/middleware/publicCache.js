/**
 * A short memory for what every visitor is shown: the restaurant, its menu, settings, offers,
 * delivery areas and pickup branches.
 *
 * Each of those answers takes the server several round trips to the database, and a menu page asks
 * for all of them at once, so a customer waited a second or two for data that changes a few times a
 * day. Here an answer is kept for 20 seconds per restaurant and the restaurant lookup for 60, and
 * anything staff change clears everything at once, so a sold-out toggle or a price edit is live
 * immediately, not after the timer.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// Things customers (and the payment, WhatsApp and Foodics-free paths) do that cannot change what the
// public lists show. Every other write clears the memory.
const NOT_A_MENU_CHANGE = /^[/](orders|visits|promotions[/]preview|auth|payments|whatsapp|feedback)/;

export const createPublicCache = ({ ttlMs = 20_000, lookupTtlMs = 60_000, now = Date.now } = {}) => {
  const responses = new Map();
  const lookups = new Map();

  const clear = () => {
    responses.clear();
    lookups.clear();
  };

  /** Route middleware for a public GET: answer from memory when fresh, otherwise remember the answer. */
  const middleware = (req, res, next) => {
    if (req.method !== 'GET' || !req.tenant) return next();
    const key = `${req.tenant.id}|${req.originalUrl}`;
    const hit = responses.get(key);
    if (hit && now() - hit.at < ttlMs) {
      res.set('X-Cache', 'HIT');
      return res.type('json').send(hit.body);
    }
    const send = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) responses.set(key, { body: JSON.stringify(body), at: now() });
      return send(body);
    };
    return next();
  };

  /** Mounted ahead of the routes: a successful change by staff empties the memory. */
  const invalidateOnWrite = (req, res, next) => {
    if (!SAFE_METHODS.has(req.method) && !NOT_A_MENU_CHANGE.test(req.path)) {
      res.on('finish', () => {
        if (res.statusCode < 400) clear();
      });
    }
    next();
  };

  /** Remembers a successful lookup (such as a restaurant by its address); a miss is never kept. */
  const remember = async (key, load) => {
    const hit = lookups.get(key);
    if (hit && now() - hit.at < lookupTtlMs) return hit.value;
    const value = await load();
    if (value) lookups.set(key, { value, at: now() });
    return value;
  };

  return { middleware, invalidateOnWrite, remember, clear };
};

export const publicCache = createPublicCache();
