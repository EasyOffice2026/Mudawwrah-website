import assert from 'node:assert/strict';
import { test } from 'node:test';
import { announce, watch, watcherCount } from '../src/services/orderEvents.js';
import { forgetAll, ONLINE_MS, statuses, touch } from '../src/services/presenceService.js';

const listener = () => {
  const heard = [];
  return { heard, send: (type) => heard.push(type) };
};

test('an owner screen hears every branch of its own restaurant, a branch screen only its own branch', () => {
  const owner = listener();
  const jahra = listener();
  const ardiya = listener();
  const stops = [watch('t1', null, owner.send), watch('t1', 'jahra', jahra.send), watch('t1', 'ardiya', ardiya.send)];
  announce('t1', 'jahra');
  assert.deepEqual(owner.heard, ['orders']);
  assert.deepEqual(jahra.heard, ['orders']);
  assert.deepEqual(ardiya.heard, []);
  announce('t1', 'ardiya');
  assert.deepEqual([owner.heard.length, jahra.heard.length, ardiya.heard.length], [2, 1, 1]);
  stops.forEach((stop) => stop());
});

test('another restaurant never hears about this one', () => {
  const other = listener();
  const stop = watch('t2', null, other.send);
  announce('t1', 'jahra');
  assert.deepEqual(other.heard, []);
  stop();
});

test('a screen that went away stops being told, and one that fails is dropped', () => {
  const before = watcherCount();
  const gone = listener();
  const stop = watch('t1', null, gone.send);
  stop();
  announce('t1', 'x');
  assert.deepEqual(gone.heard, []);
  watch('t1', null, () => {
    throw new Error('socket closed');
  });
  announce('t1', 'x');
  assert.equal(watcherCount(), before);
});

test('a branch screen is "connected" for 3 minutes after it last checked in, so a short drop never shows', () => {
  assert.equal(ONLINE_MS, 3 * 60_000);
  forgetAll();
  const branches = [
    { id: 'jahra', nameEn: 'Al Jahra', nameAr: 'الجهراء' },
    { id: 'ardiya', nameEn: 'Al Ardiya', nameAr: 'العارضية' },
  ];
  touch('t1', 'jahra', '188.70.1.2', 1_000_000);
  const at = (ms) => statuses('t1', branches, 1_000_000 + ms);
  assert.equal(at(0)[0].online, true);
  assert.equal(at(ONLINE_MS)[0].online, true);
  assert.equal(at(ONLINE_MS + 1)[0].online, false);
  assert.equal(at(5000)[0].address, '188.70.1.2');
  assert.equal(at(5000)[0].lastSeenAt, new Date(1_000_000).toISOString());
  // Never seen: not connected, no time, no address.
  assert.deepEqual([at(0)[1].online, at(0)[1].lastSeenAt, at(0)[1].address], [false, null, null]);
});

test('one restaurant\'s branch is never reported for another restaurant', () => {
  forgetAll();
  touch('t1', 'jahra', '1.1.1.1', 5);
  assert.equal(statuses('t2', [{ id: 'jahra', nameEn: 'x', nameAr: 'x' }], 6)[0].online, false);
  touch('t1', null, '1.1.1.1', 5);
  touch(null, 'jahra', '1.1.1.1', 5);
});

test('the printer is reported apart from the order screen, so a branch that only prints still shows connected', () => {
  forgetAll();
  const branches = [{ id: 'sabah', nameEn: 'Sabah', nameAr: 'صباح' }];
  touch('t1', 'sabah', '1.1.1.1', 1_000_000, 'printer');
  const [sabah] = statuses('t1', branches, 1_000_000 + 60_000);
  assert.equal(sabah.printer.online, true);
  assert.equal(sabah.printer.lastSeenAt, new Date(1_000_000).toISOString());
  assert.equal(sabah.online, false, 'no order screen open');
});

test('after a server restart the saved times stand in, until the branch checks in again', () => {
  forgetAll();
  const saved = new Date(1_000_000).toISOString();
  const branches = [{ id: 'sabah', nameEn: 'Sabah', nameAr: 'صباح', screenSeenAt: saved, screenAddress: '2.2.2.2', printerSeenAt: saved }];
  const [sabah] = statuses('t1', branches, 1_000_000 + 30_000);
  assert.deepEqual([sabah.online, sabah.address, sabah.printer.online], [true, '2.2.2.2', true]);
  // A newer check-in in memory wins over the saved time.
  touch('t1', 'sabah', '3.3.3.3', 1_500_000);
  const [later] = statuses('t1', branches, 1_500_000);
  assert.deepEqual([later.lastSeenAt, later.address], [new Date(1_500_000).toISOString(), '3.3.3.3']);
});
