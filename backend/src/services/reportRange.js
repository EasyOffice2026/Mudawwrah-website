/**
 * Report periods in the restaurant's own calendar.
 *
 * Every window is [from, to) and is paired with the window it is compared
 * against. A period that is still running is compared with the same stretch of
 * time one period earlier — this week so far against the same days and hours of
 * last week, the 1st–6th of this month against the 1st–6th of last month — so a
 * half-finished week is never set against a whole one.
 */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export const MAX_RANGE_DAYS = 366;

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendar fields of an instant as read in that timezone. */
export const zonedParts = (date, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: +parts.year,
    month: +parts.month,
    day: +parts.day,
    hour: +parts.hour % 24,
    minute: +parts.minute,
    second: +parts.second,
    weekday: WEEKDAY[parts.weekday],
  };
};

/** How far the zone is ahead of UTC at that instant, in ms. */
const offsetMs = (date, timeZone) => {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
};

/** The instant a calendar day (month may overflow, e.g. day 0 = last day of the previous month) begins in the zone. */
export const zonedMidnight = (year, month, day, timeZone) => {
  const naive = new Date(Date.UTC(year, month - 1, day));
  return new Date(naive.getTime() - offsetMs(naive, timeZone));
};

export const startOfDay = (date, timeZone) => {
  const p = zonedParts(date, timeZone);
  return zonedMidnight(p.year, p.month, p.day, timeZone);
};

/** The start of the calendar day `days` after the one `date` falls on. */
export const addDays = (date, days, timeZone) => {
  const p = zonedParts(date, timeZone);
  return zonedMidnight(p.year, p.month, p.day + days, timeZone);
};

/** YYYY-MM-DD of an instant in the zone. */
export const dayKey = (date, timeZone) => {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

/** Parses YYYY-MM-DD into its calendar fields, or null. */
const parseDay = (text) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCMonth() === month - 1 ? { year, month, day } : null;
};

export const PRESETS = ['today', 'yesterday', 'week', '7d', 'month', '30d', 'custom'];

/**
 * Resolves a preset (or a custom from/to, both YYYY-MM-DD and inclusive) into
 * the current and previous windows. Throws a RangeError on bad input.
 */
export const resolveRange = ({ preset = '7d', from, to } = {}, timeZone, now = new Date()) => {
  const today = startOfDay(now, timeZone);
  const p = zonedParts(now, timeZone);
  let start;
  let end = now;
  let prevStart;
  let prevEnd;

  switch (preset) {
    case 'today':
      start = today;
      prevStart = addDays(today, -1, timeZone);
      prevEnd = new Date(prevStart.getTime() + (now - today));
      break;
    case 'yesterday':
      start = addDays(today, -1, timeZone);
      end = today;
      prevStart = addDays(today, -2, timeZone);
      prevEnd = start;
      break;
    case 'week': {
      // Kuwait's week starts on Sunday.
      start = addDays(today, -p.weekday, timeZone);
      prevStart = addDays(start, -7, timeZone);
      prevEnd = new Date(prevStart.getTime() + (now - start));
      break;
    }
    case 'month': {
      start = zonedMidnight(p.year, p.month, 1, timeZone);
      prevStart = zonedMidnight(p.year, p.month - 1, 1, timeZone);
      // The same stretch of last month, but never past its end (31 Mar vs 28 Feb).
      prevEnd = new Date(Math.min(prevStart.getTime() + (now - start), start.getTime()));
      break;
    }
    case '30d':
    case '7d': {
      const days = preset === '7d' ? 7 : 30;
      start = addDays(today, -(days - 1), timeZone);
      prevStart = addDays(start, -days, timeZone);
      prevEnd = new Date(prevStart.getTime() + (now - start));
      break;
    }
    case 'custom': {
      const a = parseDay(from);
      const b = parseDay(to);
      if (!a || !b) throw new RangeError('Custom range needs from and to as YYYY-MM-DD');
      start = zonedMidnight(a.year, a.month, a.day, timeZone);
      const afterLast = zonedMidnight(b.year, b.month, b.day + 1, timeZone);
      if (afterLast <= start) throw new RangeError('The end date must be on or after the start date');
      if ((afterLast - start) / DAY > MAX_RANGE_DAYS + 1) throw new RangeError(`A range can cover at most ${MAX_RANGE_DAYS} days`);
      end = afterLast > now ? now : afterLast;
      if (end <= start) throw new RangeError('The range starts in the future');
      prevEnd = start;
      prevStart = new Date(start.getTime() - (afterLast - start));
      break;
    }
    default:
      throw new RangeError(`Unknown period ${preset}`);
  }

  return { preset, from: start, to: end, prevFrom: prevStart, prevTo: prevEnd, timeZone };
};

/** Whether the series should be hourly (a single day) or daily. */
export const isSingleDay = (range) => range.to - range.from <= DAY + HOUR;
