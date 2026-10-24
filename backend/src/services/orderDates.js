import { HttpError } from '../middleware/error.js';
import { zonedMidnight } from './reportRange.js';

const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The createdAt window for the order list's From and To.
 *
 * The Orders page sends plain days ("2026-10-24") from its date pickers. A plain day means that whole calendar
 * day in the restaurant's own timezone: From starts at the day's first moment, To runs to the day's last, so
 * choosing one day (From = To) shows that day's orders. These were read as midnight UTC before, which dropped
 * the whole "To" day and shifted every boundary by three hours, so a single day, or a range ending today, showed
 * "no orders" even when branches had them. A full timestamp (an API caller's) is still used exactly as given.
 */
export const createdAtWindow = (from, to, timeZone) => {
  const window = {};
  const bound = (text, which) => {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new HttpError(400, `Invalid ${which} date`);
    return date;
  };
  if (from) {
    const day = DAY_ONLY.exec(from);
    window.gte = day ? zonedMidnight(+day[1], +day[2], +day[3], timeZone) : bound(from, 'from');
  }
  if (to) {
    const day = DAY_ONLY.exec(to);
    // The day after, exclusive: the whole of the "To" day is included.
    if (day) window.lt = zonedMidnight(+day[1], +day[2], +day[3] + 1, timeZone);
    else window.lte = bound(to, 'to');
  }
  return window;
};
