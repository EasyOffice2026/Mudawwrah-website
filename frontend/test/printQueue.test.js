import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chromeShortcut,
  pickJobs,
  RETRY_AFTER_MS,
  SILENT_PRINT_MS,
  STATION_PRINT_CSS,
  stationUrl,
  testTicket,
} from '../src/lib/printQueue.js';

const jobs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('every waiting ticket is picked when nothing has been printed yet', () => {
  assert.deepEqual(pickJobs(jobs).map((j) => j.id), ['a', 'b', 'c']);
  assert.deepEqual(pickJobs(undefined), []);
});

test('a ticket this page already printed is never printed twice, even if the server still lists it', () => {
  assert.deepEqual(pickJobs(jobs, { done: new Set(['a', 'c']) }).map((j) => j.id), ['b']);
});

test('a ticket that failed is left alone for 30 seconds, then tried again', () => {
  const failedAt = new Map([['b', 1000]]);
  assert.deepEqual(pickJobs(jobs, { failedAt, now: 1000 + RETRY_AFTER_MS - 1 }).map((j) => j.id), ['a', 'c']);
  assert.deepEqual(pickJobs(jobs, { failedAt, now: 1000 + RETRY_AFTER_MS }).map((j) => j.id), ['a', 'b', 'c']);
});

test('the station link keeps the key after the #, so no server ever receives it', () => {
  const url = stationUrl('https://www.madawarah.com', 'mdawra', 'branch-1', 'KEY123');
  assert.equal(url, 'https://www.madawarah.com/r/mdawra/print/branch-1#KEY123');
  assert.equal(new URL(url).search, '');
  assert.equal(new URL(url).hash, '#KEY123');
});

test('the Windows shortcut opens Chrome in its own window, printing without a dialog', () => {
  const target = chromeShortcut('https://x.test/r/a/print/b#k');
  assert.match(target, /^"C:\\Program Files\\Google\\Chrome\\Application\\chrome\.exe" /);
  assert.match(target, /--kiosk-printing/);
  assert.match(target, /--app="https:\/\/x\.test\/r\/a\/print\/b#k"$/);
});

test('the shortcut uses a Chrome profile of its own, so silent printing holds even when Chrome is already open', () => {
  assert.match(chromeShortcut('https://x.test/'), / --user-data-dir="C:\\PrintStation" /);
});

test('a ticket prints with no page margins, so Chrome adds no date or address, and keeps clear of the paper edges', () => {
  assert.match(STATION_PRINT_CSS, /^@media print \{/);
  assert.match(STATION_PRINT_CSS, /@page \{ margin: 0; \}/);
  assert.match(STATION_PRINT_CSS, /\.print-receipt \{ padding: 0 5mm; \}/);
});

test('a print that takes longer than 1.5 s is treated as a dialog waiting for someone', () => {
  assert.equal(SILENT_PRINT_MS, 1500);
});

test('the test ticket has everything the ticket layout needs', () => {
  const ticket = testTicket(new Date('2026-10-24T08:00:00Z'));
  assert.equal(ticket.orderNumber, 'TEST-0000');
  assert.equal(ticket.items.length, 1);
  assert.equal(ticket.createdAt, '2026-10-24T08:00:00.000Z');
  assert.ok(ticket.items[0].id && ticket.items[0].lineTotal && Array.isArray(ticket.items[0].customizations));
});
