import assert from 'node:assert/strict';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';
import { authenticate, optionalAuth } from '../src/middleware/auth.js';

const run = (middleware, token) => {
  const req = { headers: { authorization: `Bearer ${token}` } };
  let error = 'not called';
  middleware(req, {}, (e) => (error = e));
  return { req, error };
};
const token = (typ) => jwt.sign({ sub: 'u1', role: 'ADMIN', ...(typ ? { typ } : {}) }, config.jwtSecret, { expiresIn: '1h' });

test('the short-lived token opens the API; so do tokens issued before token kinds existed', () => {
  assert.equal(run(authenticate, token('access')).error, undefined);
  assert.equal(run(authenticate, token()).error, undefined);
});

test('the 30-day renewal token never opens the API by itself', () => {
  assert.equal(run(authenticate, token('refresh')).error.status, 401);
  assert.equal(run(optionalAuth, token('refresh')).req.user, undefined);
});
