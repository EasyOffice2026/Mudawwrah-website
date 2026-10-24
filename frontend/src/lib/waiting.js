/**
 * Orders waiting to be accepted: how loud the screen should be about them.
 *
 * A branch has to accept an order (move it past "Pending") before the kitchen starts, and a customer is waiting for
 * that. So an order that sits is a problem the screen keeps pointing at: a banner that gets stronger the longer it
 * waits, and the chime repeating until somebody accepts it.
 */
const MINUTE = 60_000;

/** { level: none | waiting | late | urgent, minutes, count } for the feed's `waiting` figures. */
export const waitingAlarm = (waiting, now = Date.now()) => {
  if (!waiting || !waiting.count) return { level: 'none', minutes: 0, count: 0 };
  const age = Math.max(0, now - new Date(waiting.oldestAt).getTime());
  const level = age >= 15 * MINUTE ? 'urgent' : age >= 5 * MINUTE ? 'late' : 'waiting';
  return { level, minutes: Math.floor(age / MINUTE), count: waiting.count };
};

export const REPEAT_MS = 30_000;

/** Sound the chime again: only for an order that has waited a minute, and never more often than every 30 seconds. */
export const shouldChimeAgain = (alarm, lastChimeAt, now = Date.now()) =>
  alarm.level !== 'none' && alarm.minutes >= 1 && now - lastChimeAt >= REPEAT_MS;

/** "just now", "5 min ago", "3 h ago", "2 d ago" as a { key, count } for translation. */
export const agoParts = (iso, now = Date.now()) => {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / MINUTE));
  if (minutes < 1) return { key: 'now', count: 0 };
  if (minutes < 60) return { key: 'minutes', count: minutes };
  if (minutes < 60 * 24) return { key: 'hours', count: Math.floor(minutes / 60) };
  return { key: 'days', count: Math.floor(minutes / (60 * 24)) };
};
