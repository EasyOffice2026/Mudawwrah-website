import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { errorHandler } from '../src/middleware/error.js';
import { requestLog, shortRef } from '../src/middleware/requestLog.js';

const serve = async (lines) => {
  const app = express();
  app.use(requestLog({ write: (line) => lines.push(JSON.parse(line)) }));
  app.get('/ok', (req, res) => res.json({ ok: true }));
  app.get('/boom', () => {
    throw new TypeError('secret detail');
  });
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
};

test('every request gets an id, sent back to the browser and written with its line, without the query string', async () => {
  const lines = [];
  const { server, base } = await serve(lines);
  try {
    const res = await fetch(`${base}/ok?token=abc`);
    const id = res.headers.get('x-request-id');
    assert.match(id, /^[0-9a-f-]{36}$/);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].id, id);
    assert.equal(lines[0].path, '/ok');
    assert.equal(lines[0].status, 200);
    assert.ok(!JSON.stringify(lines[0]).includes('abc'), 'the query string is never logged');
  } finally {
    server.close();
  }
});

test('a failure shows the visitor a short reference that leads to its log line, never the error itself', async () => {
  const lines = [];
  const { server, base } = await serve(lines);
  const quiet = console.error;
  console.error = () => {};
  try {
    const res = await fetch(`${base}/boom`);
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.error, 'Something went wrong. Please try again.');
    assert.equal(body.ref, shortRef(res.headers.get('x-request-id')));
    assert.equal(body.ref.length, 8);
    assert.ok(!JSON.stringify(body).includes('secret detail'));
  } finally {
    console.error = quiet;
    server.close();
  }
});

test('an id handed over by a proxy is kept only when it looks like one', async () => {
  const lines = [];
  const { server, base } = await serve(lines);
  try {
    const kept = await fetch(`${base}/ok`, { headers: { 'x-request-id': 'abcdef12-3456' } });
    assert.equal(kept.headers.get('x-request-id'), 'abcdef12-3456');
    const replaced = await fetch(`${base}/ok`, { headers: { 'x-request-id': '<script>' } });
    assert.notEqual(replaced.headers.get('x-request-id'), '<script>');
  } finally {
    server.close();
  }
});
