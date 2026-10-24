import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { forgetMemory, keepIfSame, peek, recall, remember } = await import('../src/lib/storefrontCache.js');

beforeEach(() => {
  store.clear();
  forgetMemory();
});

const HOUR = 3_600_000;

test('what was kept comes back, per restaurant and per list', () => {
  remember('mdawra', '/categories', [{ id: 'c1' }], 1000);
  assert.deepEqual(peek('mdawra', '/categories', 1000 + HOUR), [{ id: 'c1' }]);
  assert.equal(peek('khobzt-marie', '/categories', 1000 + HOUR), null);
  assert.equal(peek('mdawra', '/settings', 1000 + HOUR), null);
});

test('it survives closing the page (read back from storage)', () => {
  remember('mdawra', '/settings', { isOpen: 'true' }, 5000);
  forgetMemory();
  assert.deepEqual(peek('mdawra', '/settings', 5000 + HOUR), { isOpen: 'true' });
});

test('after a day it is too old to show', () => {
  remember('mdawra', '/settings', { isOpen: 'true' }, 0);
  assert.deepEqual(peek('mdawra', '/settings', 23 * HOUR), { isOpen: 'true' });
  assert.equal(peek('mdawra', '/settings', 25 * HOUR), null);
});

test('damaged or unreadable storage is just "nothing kept"', () => {
  store.set('mdawra_sf:mdawra:/settings', '{not json');
  assert.equal(peek('mdawra', '/settings'), null);
  store.set('mdawra_sf:mdawra:/zones', JSON.stringify({ data: [] }));
  assert.equal(peek('mdawra', '/zones'), null);
  assert.equal(peek(null, '/settings'), null);
});

test('a menu page is recalled only when it has all four lists', () => {
  const at = Date.now();
  remember('mdawra', '/tenants/current', { slug: 'mdawra' }, at);
  remember('mdawra', '/categories', [], at);
  remember('mdawra', '/settings', { isOpen: 'true' }, at);
  assert.equal(recall('mdawra'), null);
  remember('mdawra', '/promotions', [], at);
  assert.deepEqual(Object.keys(recall('mdawra')), ['tenant', 'categories', 'settings', 'promotions']);
});

test('an identical fresh copy keeps the object already on screen', () => {
  const shown = { a: 1, list: [1, 2] };
  assert.equal(keepIfSame(shown, { a: 1, list: [1, 2] }), shown);
  const changed = { a: 2, list: [1, 2] };
  assert.equal(keepIfSame(shown, changed), changed);
});
