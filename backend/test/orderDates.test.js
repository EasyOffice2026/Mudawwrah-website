import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createdAtWindow } from '../src/services/orderDates.js';

const KUWAIT = 'Asia/Kuwait';
const iso = (d) => d.toISOString();

test('one chosen day is that whole day in Kuwait time, not a single instant', () => {
  const w = createdAtWindow('2026-10-24', '2026-10-24', KUWAIT);
  // Kuwait is UTC+3: the 24th begins at 21:00 UTC on the 23rd and ends at 21:00 UTC on the 24th.
  assert.equal(iso(w.gte), '2026-10-23T21:00:00.000Z');
  assert.equal(iso(w.lt), '2026-10-24T21:00:00.000Z');
  assert.equal(w.lte, undefined);
});

test('the To day is included, the day after is not', () => {
  const w = createdAtWindow('2026-10-22', '2026-10-24', KUWAIT);
  const inside = (isoTime) => new Date(isoTime) >= w.gte && new Date(isoTime) < w.lt;
  assert.equal(inside('2026-10-24T20:59:59.000Z'), true, '23:59:59 on the 24th in Kuwait');
  assert.equal(inside('2026-10-24T21:00:00.000Z'), false, 'midnight starting the 25th');
  assert.equal(inside('2026-10-21T21:00:00.000Z'), true, 'midnight starting the 22nd');
  assert.equal(inside('2026-10-21T20:59:59.000Z'), false, 'last second of the 21st');
});

test('a late-night order belongs to its Kuwait day (01:30 on the 24th is 22:30 UTC on the 23rd)', () => {
  const w = createdAtWindow('2026-10-24', '2026-10-24', KUWAIT);
  assert.equal(new Date('2026-10-23T22:30:00.000Z') >= w.gte && new Date('2026-10-23T22:30:00.000Z') < w.lt, true);
});

test('only From, or only To, works on its own', () => {
  assert.deepEqual(Object.keys(createdAtWindow('2026-10-24', '', KUWAIT)), ['gte']);
  assert.deepEqual(Object.keys(createdAtWindow('', '2026-10-24', KUWAIT)), ['lt']);
  assert.deepEqual(createdAtWindow('', '', KUWAIT), {});
});

test('the end of a month and of a year roll over correctly', () => {
  assert.equal(iso(createdAtWindow('', '2026-10-31', KUWAIT).lt), '2026-10-31T21:00:00.000Z');
  assert.equal(iso(createdAtWindow('', '2026-12-31', KUWAIT).lt), '2026-12-31T21:00:00.000Z');
  assert.equal(iso(createdAtWindow('', '2026-02-28', KUWAIT).lt), '2026-02-28T21:00:00.000Z');
});

test('another restaurant timezone moves the boundaries with it', () => {
  const w = createdAtWindow('2026-10-24', '2026-10-24', 'Asia/Dubai'); // UTC+4
  assert.equal(iso(w.gte), '2026-10-23T20:00:00.000Z');
  assert.equal(iso(w.lt), '2026-10-24T20:00:00.000Z');
});

test('a full timestamp from an API caller is used exactly as given', () => {
  const w = createdAtWindow('2026-10-24T05:00:00.000Z', '2026-10-24T09:00:00.000Z', KUWAIT);
  assert.equal(iso(w.gte), '2026-10-24T05:00:00.000Z');
  assert.equal(iso(w.lte), '2026-10-24T09:00:00.000Z');
  assert.equal(w.lt, undefined);
});

test('a date that is not a date is a clear 400, not a server error', () => {
  assert.throws(() => createdAtWindow('not-a-date', '', KUWAIT), (e) => e.status === 400 && /from/.test(e.message));
  assert.throws(() => createdAtWindow('', 'nope', KUWAIT), (e) => e.status === 400 && /to/.test(e.message));
});
