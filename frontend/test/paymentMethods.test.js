import assert from 'node:assert/strict';
import { test } from 'node:test';
import { methodOfChoice, offeredPayments, paymentChoices } from '../src/lib/paymentMethods.js';

test('a card is offered as Credit Card and as American Express, as on the payment page', () => {
  assert.deepEqual(paymentChoices(['KNET', 'CARD', 'APPLE_PAY']), ['KNET', 'CARD', 'AMEX', 'APPLE_PAY']);
  assert.deepEqual(paymentChoices(['KNET']), ['KNET']);
});

test('American Express is paid through the card form, so the order records a card payment', () => {
  assert.equal(methodOfChoice('AMEX'), 'CARD');
  assert.equal(methodOfChoice('CARD'), 'CARD');
  assert.equal(methodOfChoice('KNET'), 'KNET');
});

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
