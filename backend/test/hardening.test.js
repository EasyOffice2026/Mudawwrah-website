import assert from 'node:assert/strict';
import { test } from 'node:test';

delete process.env.WHATSAPP_APP_SECRET;
process.env.PAYMENT_PROVIDER = 'tap';
const { verifySignature } = await import('../src/services/whatsapp/waClient.js');
const { errorHandler } = await import('../src/middleware/error.js');
const { mockPay } = await import('../src/controllers/paymentController.js');

const respond = (err) => {
  const out = {};
  const res = { headersSent: false, set() {}, status(code) { out.status = code; return this; }, json(body) { out.body = body; return this; } };
  const quiet = console.error;
  console.error = () => {};
  try {
    errorHandler(err, {}, res, () => {});
  } finally {
    console.error = quiet;
  }
  return out;
};

test('without the WhatsApp app secret no webhook is believed', () => {
  assert.equal(verifySignature(Buffer.from('{}'), 'sha256=anything'), false);
  assert.equal(verifySignature(Buffer.from('{}'), undefined), false);
});

test('an unexpected failure never shows its own text to the visitor', () => {
  const out = respond(new TypeError("Cannot read properties of undefined (reading 'secretKey')"));
  assert.equal(out.status, 500);
  assert.equal(out.body.error, 'Something went wrong. Please try again.');
});

test('a deliberate error still says what is wrong', () => {
  const err = Object.assign(new Error('That promo code is not valid'), { status: 404 });
  assert.deepEqual(respond(err), { status: 404, body: { error: 'That promo code is not valid' } });
});

test('the pretend payment page does not exist next to a real gateway', async () => {
  await assert.rejects(mockPay({ query: { ref: 'X-1' } }, {}), (error) => error.status === 404);
});
