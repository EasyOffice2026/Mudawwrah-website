import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSseParser, reconnectDelay } from '../src/lib/liveStream.js';
import { agoParts, REPEAT_MS, shouldChimeAgain, waitingAlarm } from '../src/lib/waiting.js';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

test('nothing waiting means a quiet screen', () => {
  assert.deepEqual(waitingAlarm({ count: 0, oldestAt: null }, NOW), { level: 'none', minutes: 0, count: 0 });
  assert.equal(waitingAlarm(undefined, NOW).level, 'none');
});

test('the longer an order waits, the stronger the alarm: 0-5 waiting, 5-15 late, 15+ urgent', () => {
  const level = (m) => waitingAlarm({ count: 2, oldestAt: ago(m) }, NOW).level;
  assert.equal(level(0), 'waiting');
  assert.equal(level(4.9), 'waiting');
  assert.equal(level(5), 'late');
  assert.equal(level(14.9), 'late');
  assert.equal(level(15), 'urgent');
  assert.equal(level(600), 'urgent');
  assert.deepEqual(waitingAlarm({ count: 3, oldestAt: ago(7) }, NOW), { level: 'late', minutes: 7, count: 3 });
});

test('a clock slightly ahead of the server never gives a negative wait', () => {
  assert.equal(waitingAlarm({ count: 1, oldestAt: new Date(NOW + 5000).toISOString() }, NOW).minutes, 0);
});

test('the chime repeats only after the first minute, and not more than every 30 seconds', () => {
  const alarm = (m) => waitingAlarm({ count: 1, oldestAt: ago(m) }, NOW);
  assert.equal(shouldChimeAgain(alarm(0.5), 0, NOW), false, 'a brand-new order has already chimed on arrival');
  assert.equal(shouldChimeAgain(alarm(1), 0, NOW), true);
  assert.equal(shouldChimeAgain(alarm(10), NOW - REPEAT_MS + 1, NOW), false, 'chimed 29 seconds ago');
  assert.equal(shouldChimeAgain(alarm(10), NOW - REPEAT_MS, NOW), true);
  assert.equal(shouldChimeAgain({ level: 'none', minutes: 0, count: 0 }, 0, NOW), false);
});

test('"last seen" is worded as now, minutes, hours or days', () => {
  assert.deepEqual(agoParts(ago(0.2), NOW), { key: 'now', count: 0 });
  assert.deepEqual(agoParts(ago(5), NOW), { key: 'minutes', count: 5 });
  assert.deepEqual(agoParts(ago(59), NOW), { key: 'minutes', count: 59 });
  assert.deepEqual(agoParts(ago(60), NOW), { key: 'hours', count: 1 });
  assert.deepEqual(agoParts(ago(60 * 25), NOW), { key: 'days', count: 1 });
});

test('the live connection is read line by line, even when a message is split across reads', () => {
  const heard = [];
  const feed = createSseParser((data) => heard.push(data));
  feed('retry: 3000\n\ndata: hel');
  assert.deepEqual(heard, []);
  feed('lo\n\n: ping\n\ndata: orders\n');
  feed('\ndata: orders\n\n');
  assert.deepEqual(heard, ['hello', 'orders', 'orders']);
});

test('it reconnects after 3, 6, 12, 24 and then every 30 seconds', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(reconnectDelay), [3000, 6000, 12000, 24000, 30000, 30000]);
});
