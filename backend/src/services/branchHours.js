/**
 * When a branch is open, worked out in the restaurant's own timezone.
 *
 * Hours are one entry per weekday (0 = Sunday):
 *   { day, open: "09:00", close: "23:00", closed: false, breaks: [{ from: "11:30", to: "13:00" }] }
 * - equal open and close means open all day (the 24-hour branches);
 * - close before open is a window running past midnight, which counts for the day it started;
 * - breaks close the branch for part of the day, e.g. Friday prayer.
 * A branch with no hours at all is treated as always open.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (hhmm) => {
  if (!HHMM.test(hhmm || '')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Weekday and minutes since midnight at `date`, as a wall clock in `timeZone` reads it. */
export const localClock = (date, timeZone = 'Asia/Kuwait') => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
};

const entryFor = (hours, day) => (Array.isArray(hours) ? hours.find((row) => Number(row?.day) === day) : null);

const inBreak = (entry, minutes) =>
  (entry?.breaks || []).some((b) => {
    const from = toMinutes(b?.from);
    const to = toMinutes(b?.to);
    if (from === null || to === null || from === to) return false;
    return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
  });

/** True when the branch takes orders at `date`. */
export const isOpenAt = (hours, date = new Date(), timeZone = 'Asia/Kuwait') => {
  if (!Array.isArray(hours) || !hours.length) return true;
  const { day, minutes } = localClock(date, timeZone);

  const today = entryFor(hours, day);
  if (today && !today.closed) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    const within = open === null || close === null || open === close || (close > open ? minutes >= open && minutes < close : minutes >= open);
    if (within && !inBreak(today, minutes)) return true;
  }

  // Yesterday's window may still be running after midnight.
  const yesterday = entryFor(hours, (day + 6) % 7);
  if (yesterday && !yesterday.closed) {
    const open = toMinutes(yesterday.open);
    const close = toMinutes(yesterday.close);
    if (open !== null && close !== null && close < open && minutes < close && !inBreak(yesterday, minutes)) return true;
  }
  return false;
};

/**
 * When the branch next opens, as "HH:MM" plus how many days ahead (0 = today),
 * found by checking the next week in 15-minute steps. Null if it never opens.
 */
export const nextOpening = (hours, date = new Date(), timeZone = 'Asia/Kuwait') => {
  if (!Array.isArray(hours) || !hours.length) return null;
  const step = 15 * 60 * 1000;
  const start = new Date(Math.ceil(date.getTime() / step) * step);
  const startDay = localClock(date, timeZone).day;
  for (let t = start.getTime(); t < date.getTime() + 7 * 24 * 3600 * 1000; t += step) {
    const at = new Date(t);
    if (isOpenAt(hours, at, timeZone)) {
      const { day, minutes } = localClock(at, timeZone);
      return {
        time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
        daysAhead: (day - startDay + 7) % 7,
      };
    }
  }
  return null;
};
