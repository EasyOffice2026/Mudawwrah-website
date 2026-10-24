import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorHandler, HttpError } from '../src/middleware/error.js';
import { isPoolFull, withRetry } from '../src/prisma.js';

const POOL_FULL = new Error('Error querying the database: FATAL: (EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15');

/** An operation that fails with `error` the first `times` calls and then succeeds. */
const flaky = (error, times) => {
  const state = { calls: 0 };
  state.run = async () => {
    state.calls += 1;
    if (state.calls <= times) throw error;
    return 'done';
  };
  return state;
};

test('a full connection pool is recognised, other errors are not', () => {
  assert.equal(isPoolFull(POOL_FULL), true);
  assert.equal(isPoolFull(new Error('Unique constraint failed')), false);
  assert.equal(isPoolFull(null), false);
});

test('a read and a write both ride out a full pool, because nothing had run', async () => {
  for (const operation of ['findMany', 'create', 'update']) {
    const job = flaky(POOL_FULL, 2);
    assert.equal(await withRetry(operation, job.run), 'done');
    assert.equal(job.calls, 3);
  }
});

test('a write is still not repeated after a dropped connection, a read is', async () => {
  const dropped = Object.assign(new Error('closed'), { code: 'P1017' });
  const write = flaky(dropped, 1);
  await assert.rejects(withRetry('create', write.run), /closed/);
  assert.equal(write.calls, 1);
  const read = flaky(dropped, 1);
  assert.equal(await withRetry('findMany', read.run), 'done');
  assert.equal(read.calls, 2);
});

test('an ordinary error is never retried', async () => {
  const job = flaky(new Error('Unique constraint failed'), 5);
  await assert.rejects(withRetry('create', job.run), /Unique constraint/);
  assert.equal(job.calls, 1);
});

test('a pool that stays full gives up after a few tries', async () => {
  const job = flaky(POOL_FULL, 99);
  await assert.rejects(withRetry('findMany', job.run), /EMAXCONNSESSION/);
  assert.equal(job.calls, 6);
});

const respond = (error) => {
  const out = { headers: {} };
  const res = {
    headersSent: false,
    set: (k, v) => { out.headers[k] = v; return res; },
    status: (code) => { out.status = code; return res; },
    json: (body) => { out.body = body; return res; },
  };
  const log = console.error;
  console.error = () => {};
  try { errorHandler(error, {}, res, () => {}); } finally { console.error = log; }
  return out;
};

test('a customer sees "busy, try again" for a full pool, never database text', () => {
  const out = respond(POOL_FULL);
  assert.equal(out.status, 503);
  assert.equal(out.headers['Retry-After'], '2');
  assert.match(out.body.error, /busy/);
  assert.doesNotMatch(out.body.error, /prisma|EMAXCONN|pool/i);
});

test('any other database failure is a plain message', () => {
  const out = respond(new Error('\nInvalid `prisma.order.findMany()` invocation:\n\nConnection refused'));
  assert.equal(out.status, 500);
  assert.equal(out.body.error, 'Something went wrong. Please try again.');
});

test('errors the app raised on purpose keep their own status and message', () => {
  const out = respond(new HttpError(409, 'The restaurant is currently closed for orders'));
  assert.equal(out.status, 409);
  assert.equal(out.body.error, 'The restaurant is currently closed for orders');
});
