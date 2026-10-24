import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET = 'unit-test-secret';
const { keyMatches, printKeyFor } = await import('../src/services/printService.js');
const { requirePrintKey } = await import('../src/middleware/printKey.js');

test('a station key is stable, long, and different for every restaurant and branch', () => {
  const key = printKeyFor('tenant-1', 'branch-1');
  assert.equal(key, printKeyFor('tenant-1', 'branch-1'));
  assert.equal(key.length, 32);
  assert.match(key, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(key, printKeyFor('tenant-1', 'branch-2'));
  assert.notEqual(key, printKeyFor('tenant-2', 'branch-1'));
  assert.notEqual(key, printKeyFor('tenant-1', 'unassigned'));
});

test('only the exact key opens a branch', () => {
  const key = printKeyFor('t', 'b');
  assert.equal(keyMatches('t', 'b', key), true);
  assert.equal(keyMatches('t', 'b', key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A')), false);
  assert.equal(keyMatches('t', 'b', key.slice(1)), false);
  assert.equal(keyMatches('t', 'b', ''), false);
  assert.equal(keyMatches('t', 'b', undefined), false);
  assert.equal(keyMatches('t', 'other', key), false);
});

const run = (req) => {
  let result;
  requirePrintKey(req, {}, (error) => {
    result = error || 'ok';
  });
  return result;
};

test('the guard wants the key in the header, the branch in the address, and a restaurant', () => {
  const key = printKeyFor('t', 'b');
  const good = { tenant: { id: 't' }, query: { branch: 'b' }, headers: { 'x-print-key': key } };
  assert.equal(run(good), 'ok');
  assert.equal(good.printBranch, 'b');
  // a key sent only in the address is not accepted (addresses end up in server logs)
  assert.equal(run({ tenant: { id: 't' }, query: { branch: 'b', key }, headers: {} }).status, 401);
  assert.equal(run({ ...good, query: {} }).status, 401);
  assert.equal(run({ ...good, tenant: null }).status, 401);
  assert.equal(run({ ...good, headers: { 'x-print-key': 'wrong' } }).status, 401);
});
