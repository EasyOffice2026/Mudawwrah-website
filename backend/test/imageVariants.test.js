import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import express from 'express';
import sharp from 'sharp';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'variants-'));
process.env.UPLOAD_DIR = dir;
const { serveVariant } = await import('../src/services/imageVariants.js');

let server;
let base;
before(async () => {
  // A big, noisy-ish 3000x2000 photo and a small square PNG, as an owner might upload.
  await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 180, g: 40, b: 60 } } })
    .jpeg({ quality: 95 })
    .toFile(path.join(dir, '111-aaaa.jpg'));
  await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 120, b: 200, alpha: 1 } } })
    .png()
    .toFile(path.join(dir, '222-bbbb.png'));
  fs.mkdirSync(path.join(dir, 'thumbs'));
  fs.writeFileSync(path.join(dir, 'thumbs', '111-aaaa.jpg'), 'old thumbnail');

  const app = express();
  app.get('/uploads/:size/:name', serveVariant);
  app.use('/uploads', express.static(dir));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = async (p) => {
  const res = await fetch(`${base}${p}`);
  return { res, bytes: Buffer.from(await res.arrayBuffer()) };
};

test('the grid picture is a 400x400 square WebP, far smaller than the original', async () => {
  const { res, bytes } = await get('/uploads/w400/111-aaaa.webp');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/webp');
  assert.match(res.headers.get('cache-control'), /immutable/);
  const meta = await sharp(bytes).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 400, 400]);
  assert.ok(bytes.length < fs.statSync(path.join(dir, '111-aaaa.jpg')).size / 5);
});

test("a dish page's picture is at most 900 wide and keeps its shape", async () => {
  const { bytes } = await get('/uploads/w900/111-aaaa.webp');
  const meta = await sharp(bytes).metadata();
  assert.deepEqual([meta.width, meta.height], [900, 600]);
});

test('a small picture is not blown up', async () => {
  const { bytes } = await get('/uploads/w900/222-bbbb.webp');
  assert.equal((await sharp(bytes).metadata()).width, 200);
});

test('the copy is saved on disk and served from there the second time', async () => {
  const target = path.join(dir, 'w900', '111-aaaa.webp');
  assert.ok(fs.existsSync(target));
  const before = fs.statSync(target).mtimeMs;
  await get('/uploads/w900/111-aaaa.webp');
  assert.equal(fs.statSync(target).mtimeMs, before);
});

test('the same picture asked for many times at once is made once and every answer is good', async () => {
  const answers = await Promise.all(Array.from({ length: 8 }, () => get('/uploads/w400/222-bbbb.webp')));
  assert.ok(answers.every(({ res }) => res.status === 200));
  assert.deepEqual(fs.readdirSync(path.join(dir, 'w400')).filter((f) => f.endsWith('.tmp')), []);
});

test('a picture that does not exist is a 404, not an error', async () => {
  assert.equal((await get('/uploads/w400/999-nothing.webp')).res.status, 404);
});

test('nothing can reach outside the uploads folder', async () => {
  for (const p of ['/uploads/w400/..%2F..%2Fpackage.json', '/uploads/w400/%2e%2e%2fsecret.webp', '/uploads/w400/a.b.webp']) {
    assert.equal((await get(p)).res.status, 404, p);
  }
  // a name that is not .webp is not a variant either
  assert.equal((await get('/uploads/w400/111-aaaa.jpg')).res.status, 404);
});

test('the plain files and the old thumbnails are still served as before', async () => {
  const original = await get('/uploads/111-aaaa.jpg');
  assert.equal(original.res.status, 200);
  const thumb = await get('/uploads/thumbs/111-aaaa.jpg');
  assert.equal(thumb.bytes.toString(), 'old thumbnail');
});
