import { clientIp } from '../services/authService.js';
import { getAll as getSettings } from '../services/settingService.js';
import * as visits from '../services/visitService.js';
import { currentTenantId } from '../tenantContext.js';

// Public and unauthenticated, so one address may only add a few visits per
// window — enough for real browsing, too few for a script to inflate the
// conversion rate. Visit counts are an estimate by nature; this keeps them honest.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const recent = new Map();

const allowed = (ip, now = Date.now()) => {
  const entry = recent.get(ip);
  if (entry && now - entry.start < WINDOW_MS) {
    if (entry.count >= MAX_PER_WINDOW) return false;
    entry.count += 1;
    return true;
  }
  recent.set(ip, { start: now, count: 1 });
  if (recent.size > 5000) for (const [key, value] of recent) if (now - value.start >= WINDOW_MS) recent.delete(key);
  return true;
};

export const record = async (req, res) => {
  if (allowed(clientIp(req))) {
    const settings = await getSettings();
    await visits.record(currentTenantId(), settings.timezone || 'Asia/Kuwait');
  }
  res.status(204).end();
};
