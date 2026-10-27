import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET = 'unit-secret';
delete process.env.SECRETS_KEY;
const { hint, open, seal } = await import('../src/services/secretBox.js');

test('a secret is stored encrypted and read back exactly', () => {
  const sealed = seal('sk_live_ABCDEF1234567890');
  assert.ok(!sealed.includes('sk_live'), 'nothing of the key is visible stored');
  assert.notEqual(seal('sk_live_ABCDEF1234567890'), sealed, 'the same key never looks the same twice');
  assert.equal(open(sealed), 'sk_live_ABCDEF1234567890');
});

test('a damaged or foreign value is never half-read: it reads as no secret', () => {
  const sealed = seal('sk_test_ABCDEF1234567890');
  const [v, iv, tag, data] = sealed.split(':');
  const flipped = Buffer.from(data, 'base64');
  flipped[0] ^= 1;
  assert.equal(open([v, iv, tag, flipped.toString('base64')].join(':')), null);
  assert.equal(open('not-a-sealed-value'), null);
  assert.equal(open(null), null);
});

test('only the kind and last four characters are ever shown', () => {
  assert.equal(hint('sk_live_FAKEKEYFORTESTS0000wxyz'), 'sk_live_…wxyz');
  assert.equal(hint(null), null);
});
