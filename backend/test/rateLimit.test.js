import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRateLimit } from '../src/middleware/rateLimit.js';

const call = (limit, ip) => {
  let error;
  const headers = {};
  limit({ headers: { 'cf-connecting-ip': ip } }, { set: (k, v) => (headers[k] = v) }, (e) => (error = e));
  return { error, headers };
};

test('an address gets its allowance, then is refused until the window ends', () => {
  let clock = 0;
  const limit = createRateLimit({ name: 't', windowMs: 60_000, max: 3, now: () => clock });
  for (let i = 0; i < 3; i++) assert.equal(call(limit, '1.1.1.1').error, undefined);
  const refused = call(limit, '1.1.1.1');
  assert.equal(refused.error.status, 429);
  assert.equal(refused.headers['Retry-After'], '60');
  clock = 60_000;
  assert.equal(call(limit, '1.1.1.1').error, undefined, 'a new window starts afresh');
});

test('each address is counted on its own', () => {
  const limit = createRateLimit({ name: 't', windowMs: 60_000, max: 1, now: () => 0 });
  assert.equal(call(limit, '1.1.1.1').error, undefined);
  assert.equal(call(limit, '2.2.2.2').error, undefined);
  assert.equal(call(limit, '1.1.1.1').error.status, 429);
});
