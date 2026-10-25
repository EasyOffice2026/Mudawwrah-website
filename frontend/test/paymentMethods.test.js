import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offeredPayments } from '../src/lib/paymentMethods.js';

test('the checkout offers exactly what the restaurant switched on, in its order', () => {
  assert.deepEqual(offeredPayments('KNET,CARD,APPLE_PAY', { applePay: true }), ['KNET', 'CARD', 'APPLE_PAY']);
  assert.deepEqual(offeredPayments('KNET'), ['KNET']);
  assert.deepEqual(offeredPayments(' card , knet '), ['CARD', 'KNET']);
});

test('Apple Pay is only offered on a device that can use it', () => {
  assert.deepEqual(offeredPayments('KNET,CARD,APPLE_PAY', { applePay: false }), ['KNET', 'CARD']);
});

test('unknown or repeated methods are ignored, and a missing setting falls back to KNET and card', () => {
  assert.deepEqual(offeredPayments('KNET,BITCOIN,KNET'), ['KNET']);
  assert.deepEqual(offeredPayments(undefined), ['KNET', 'CARD']);
  assert.deepEqual(offeredPayments(''), ['KNET', 'CARD']);
});
