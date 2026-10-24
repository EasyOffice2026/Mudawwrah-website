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

test('a branch screen is "connected" for 45 seconds after it last checked in', () => {
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
