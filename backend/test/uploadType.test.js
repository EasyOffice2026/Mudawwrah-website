import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { imageExtension } from '../src/storage.js';

const picture = (format) => sharp({ create: { width: 4, height: 4, channels: 3, background: '#b00020' } })[format]().toBuffer();

test('a picture is stored by what it really is, whatever it was called', async () => {
  assert.equal(await imageExtension(await picture('png')), '.png');
  assert.equal(await imageExtension(await picture('jpeg')), '.jpg');
  assert.equal(await imageExtension(await picture('webp')), '.webp');
});

test('an SVG, or anything that is not a picture, is refused even when declared as one', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>alert(1)</script></svg>');
  await assert.rejects(imageExtension(svg), (error) => error.status === 400);
  await assert.rejects(imageExtension(Buffer.from('<html><script>alert(1)</script></html>')), (error) => error.status === 400);
});
