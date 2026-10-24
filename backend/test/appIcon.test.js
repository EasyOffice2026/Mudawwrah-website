import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import express from 'express';
import sharp from 'sharp';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
process.env.UPLOAD_DIR = dir;
const { ICON_SIZES, iconFor } = await import('../src/services/appIcon.js');
const { icon } = await import('../src/controllers/iconController.js');
const { errorHandler } = await import('../src/middleware/error.js');
const { asyncHandler } = await import('../src/middleware/error.js');

let server;
let base;
let tenant = null;

before(async () => {
  // A dark portrait logo with a white mark in the middle, as many restaurants have (opaque background, not square).
  await sharp({ create: { width: 400, height: 520, channels: 4, background: { r: 60, g: 0, b: 12, alpha: 1 } } })
    .composite([{ input: await sharp({ create: { width: 160, height: 160, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer(), gravity: 'centre' }])
    .png()
    .toFile(path.join(dir, '111-logo.png'));
  // A logo with a transparent background: a white mark only.
  await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 120, height: 120, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer(), gravity: 'centre' }])
    .png()
    .toFile(path.join(dir, '222-mark.png'));
  const app = express();
  app.use((req, res, next) => {
    req.tenant = tenant;
    next();
  });
  app.get('/icon', asyncHandler(icon));
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const pixel = async (png, x, y) => {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
};
const RED = { id: 't1', brandColor: '#B00020', logoUrl: 'https://www.madawarah.com/uploads/111-logo.png' };
const TRANSPARENT = { id: 't1b', brandColor: '#B00020', logoUrl: 'https://www.madawarah.com/uploads/222-mark.png' };

test('the icon is a square PNG of the size asked for', async () => {
  for (const size of ICON_SIZES) {
    const meta = await sharp(await iconFor(RED, size)).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['png', size, size]);
  }
});

test('a logo with its own background blends in: no visible edges, the mark stays in the middle', async () => {
  const png = await iconFor(RED, 512);
  assert.deepEqual(await pixel(png, 4, 4), [60, 0, 12], 'the icon takes the logo\'s own background colour');
  assert.deepEqual(await pixel(png, 507, 507), [60, 0, 12]);
  assert.deepEqual(await pixel(png, 30, 256), [60, 0, 12], 'no band where the logo stops and the canvas starts');
  assert.deepEqual(await pixel(png, 256, 256), [255, 255, 255], 'centre is the mark');
});

test('a logo with a transparent background sits on the restaurant\'s brand colour', async () => {
  const png = await iconFor(TRANSPARENT, 512);
  assert.deepEqual(await pixel(png, 4, 4), [0xb0, 0x00, 0x20]);
  assert.deepEqual(await pixel(png, 256, 256), [255, 255, 255]);
  assert.deepEqual(await pixel(png, 60, 256), [0xb0, 0x00, 0x20], 'margin around the mark is the brand colour');
});

test('a restaurant with no logo gets its colour as a plain square', async () => {
  const png = await iconFor({ id: 't2', brandColor: '#0B6E4F', logoUrl: null }, 192);
  assert.deepEqual(await pixel(png, 96, 96), [0x0b, 0x6e, 0x4f]);
  assert.deepEqual(await pixel(png, 2, 2), [0x0b, 0x6e, 0x4f]);
});

test('a logo hosted elsewhere, a missing file, or an invalid colour never breaks the icon', async () => {
  const elsewhere = await iconFor({ id: 't3', brandColor: '#112233', logoUrl: 'https://res.cloudinary.com/x/image/upload/a.jpg' }, 192);
  assert.deepEqual(await pixel(elsewhere, 96, 96), [0x11, 0x22, 0x33]);
  const missing = await iconFor({ id: 't4', brandColor: '#112233', logoUrl: 'https://x.test/uploads/999-gone.jpg' }, 192);
  assert.deepEqual(await pixel(missing, 96, 96), [0x11, 0x22, 0x33]);
  const bad = await iconFor({ id: 't5', brandColor: 'not-a-colour', logoUrl: null }, 192);
  assert.deepEqual(await pixel(bad, 96, 96), [0xb0, 0x00, 0x20], 'falls back to the platform red');
});

test('a path trick in the logo address cannot reach outside the uploads folder', async () => {
  const png = await iconFor({ id: 't6', brandColor: '#112233', logoUrl: 'https://x.test/uploads/..%2F..%2Fpackage.json' }, 192);
  assert.deepEqual(await pixel(png, 96, 96), [0x11, 0x22, 0x33]);
});

test('it is made once, saved, and made again when the colour or the logo changes', async () => {
  const before = fs.readdirSync(path.join(dir, 'icons')).length;
  await iconFor(RED, 192);
  assert.equal(fs.readdirSync(path.join(dir, 'icons')).length, before, 'a repeat is served from the saved file');
  await iconFor({ ...RED, brandColor: '#00AA00' }, 192);
  assert.equal(fs.readdirSync(path.join(dir, 'icons')).length, before + 1, 'a new colour makes a new icon');
});

test('a size that is not offered is refused', async () => {
  assert.equal(await iconFor(RED, 100), null);
});

test('the address answers a PNG with a day\'s cache, a clear 400 for a bad size, and a 404 with no restaurant', async () => {
  tenant = RED;
  const ok = await fetch(`${base}/icon?size=192`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  assert.match(ok.headers.get('cache-control'), /max-age=86400/);
  assert.equal((await sharp(Buffer.from(await ok.arrayBuffer())).metadata()).width, 192);
  assert.equal((await fetch(`${base}/icon`)).status, 200, 'defaults to 192');
  assert.equal((await fetch(`${base}/icon?size=300`)).status, 400);
  tenant = null;
  assert.equal((await fetch(`${base}/icon?size=192`)).status, 404);
});
