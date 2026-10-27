import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';
import { authenticate, optionalAuth } from '../src/middleware/auth.js';
import { remember } from '../src/services/sessionService.js';

const run = async (middleware, token) => {
  const req = { headers: { authorization: `Bearer ${token}` } };
  let error = 'not called';
  await middleware(req, {}, (e) => (error = e));
  return { req, error };
};
const token = (typ, extra = {}) => jwt.sign({ sub: 'u1', role: 'ADMIN', ...(typ ? { typ } : {}), ...extra }, config.jwtSecret, { expiresIn: '1h' });

test('the short-lived token opens the API; so do tokens issued before token kinds existed', async () => {
  remember('u1', { version: 0 });
  assert.equal((await run(authenticate, token('access'))).error, undefined);
  assert.equal((await run(authenticate, token())).error, undefined);
});

test('the 30-day renewal token never opens the API by itself', async () => {
  remember('u1', { version: 0 });
  assert.equal((await run(authenticate, token('refresh'))).error.status, 401);
  assert.equal((await run(optionalAuth, token('refresh'))).req.user, undefined);
});

test('a session ended since the token was made is refused at once; a disabled account too', async () => {
  remember('u1', { version: 2 });
  assert.equal((await run(authenticate, token('access', { tv: 1 }))).error.status, 401, 'an older version');
  assert.equal((await run(authenticate, token('access', { tv: 2 }))).error, undefined, 'the current version');
  assert.equal((await run(optionalAuth, token('access', { tv: 1 }))).req.user, undefined, 'an ended session orders as a guest');
  remember('u1', { version: 2, active: false });
  assert.equal((await run(authenticate, token('access', { tv: 2 }))).error.status, 401, 'a disabled account');
});
