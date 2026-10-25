import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import express from 'express';
import { createPublicCache } from '../src/middleware/publicCache.js';

let clock;
let calls;
let server;
let base;
let cache;

beforeEach(async () => {
  clock = 1_000_000;
  calls = { menu: 0, lookups: 0 };
  cache = createPublicCache({ ttlMs: 20_000, lookupTtlMs: 60_000, now: () => clock });
  const app = express();
  app.use(express.json());
  app.use(cache.invalidateOnWrite);
  // The restaurant is chosen by a header here, as the real resolver does from the address.
  app.use((req, res, next) => {
    req.tenant = req.headers['x-tenant'] ? { id: `t-${req.headers['x-tenant']}` } : null;
    next();
  });
  app.get('/menu', cache.middleware, (req, res) => {
    calls.menu += 1;
    res.json({ tenant: req.tenant?.id, n: calls.menu, q: req.query.q ?? null });
  });
  app.get('/broken', cache.middleware, (req, res) => {
    calls.menu += 1;
    res.status(500).json({ error: 'boom' });
  });
  app.put('/settings', (req, res) => res.json({ ok: true }));
  app.put('/refused', (req, res) => res.status(403).json({ error: 'no' }));
  app.post('/orders', (req, res) => res.status(201).json({ ok: true }));
  app.post('/visits', (req, res) => res.status(204).end());
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(() => server.close());

const get = async (path, tenant = 'a') => {
  const res = await fetch(`${base}${path}`, { headers: tenant ? { 'x-tenant': tenant } : {} });
  return { res, body: await res.json() };
};
const send = (method, path) => fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: '{}' });

test('the second request within 20 seconds is answered from memory, and says so', async () => {
  const first = await get('/menu');
  const second = await get('/menu');
  assert.equal(calls.menu, 1);
  assert.equal(first.res.headers.get('x-cache'), null);
  assert.equal(second.res.headers.get('x-cache'), 'HIT');
  assert.deepEqual(second.body, first.body);
});

test('after 20 seconds it is looked up again', async () => {
  await get('/menu');
  clock += 19_999;
  await get('/menu');
  assert.equal(calls.menu, 1);
  clock += 2;
  await get('/menu');
  assert.equal(calls.menu, 2);
});

test('one restaurant never receives another restaurant\'s answer', async () => {
  const a = await get('/menu', 'a');
  const b = await get('/menu', 'b');
  assert.equal(calls.menu, 2);
  assert.equal(a.body.tenant, 't-a');
  assert.equal(b.body.tenant, 't-b');
});

test('a different question is a different answer', async () => {
  await get('/menu?q=1');
  const other = await get('/menu?q=2');
  assert.equal(calls.menu, 2);
  assert.equal(other.body.q, '2');
});

test('with no restaurant resolved nothing is kept', async () => {
  await get('/menu', null);
  await get('/menu', null);
  assert.equal(calls.menu, 2);
});

test('an error is never remembered', async () => {
  await get('/broken');
  const again = await get('/broken');
  assert.equal(calls.menu, 2);
  assert.equal(again.res.status, 500);
});

test('a change made by staff empties the memory at once', async () => {
  await get('/menu');
  assert.equal((await send('PUT', '/settings')).status, 200);
  const after = await get('/menu');
  assert.equal(calls.menu, 2);
  assert.equal(after.res.headers.get('x-cache'), null);
});

test('a change that was refused leaves it alone', async () => {
  await get('/menu');
  assert.equal((await send('PUT', '/refused')).status, 403);
  await get('/menu');
  assert.equal(calls.menu, 1);
});

test('what customers do (orders, visits) does not throw the memory away', async () => {
  await get('/menu');
  await send('POST', '/orders');
  await send('POST', '/visits');
  await get('/menu');
  assert.equal(calls.menu, 1);
});

test('a restaurant lookup is kept for a minute, and so is a miss', async () => {
  const load = async () => {
    calls.lookups += 1;
    return { id: 'r1' };
  };
  await cache.remember('slug:mdawra', load);
  clock += 59_000;
  await cache.remember('slug:mdawra', load);
  assert.equal(calls.lookups, 1);
  clock += 2_000;
  await cache.remember('slug:mdawra', load);
  assert.equal(calls.lookups, 2);

  const miss = async () => {
    calls.lookups += 1;
    return null;
  };
  // An address that is no restaurant's is asked about on every request; it must not cost the database each time.
  assert.equal(await cache.remember('slug:nobody', miss), null);
  assert.equal(await cache.remember('slug:nobody', miss), null);
  assert.equal(calls.lookups, 3);
  clock += 61_000;
  await cache.remember('slug:nobody', miss);
  assert.equal(calls.lookups, 4);
});

test('a remembered miss is forgotten as soon as staff change anything (a restaurant or domain added)', async () => {
  let found = null;
  const load = async () => {
    calls.lookups += 1;
    return found;
  };
  assert.equal(await cache.remember('domain:new.example', load), null);
  found = { id: 'r9' };
  cache.clear();
  assert.deepEqual(await cache.remember('domain:new.example', load), { id: 'r9' });
});

test('clearing forgets lookups too', async () => {
  const load = async () => {
    calls.lookups += 1;
    return { id: 'r1' };
  };
  await cache.remember('slug:x', load);
  cache.clear();
  await cache.remember('slug:x', load);
  assert.equal(calls.lookups, 2);
});
