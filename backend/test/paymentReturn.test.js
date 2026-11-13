import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storefrontAddress } from '../src/controllers/paymentController.js';

const order = { id: 'ord_123', orderNumber: 'MD-1042', paymentStatus: 'PAID' };

test('a paid customer comes back to the menu with the order id, so the page can link to tracking', () => {
  const url = new URL(storefrontAddress('https://shop.example', 'demo', order));
  assert.equal(url.origin + url.pathname, 'https://shop.example/r/demo');
  assert.equal(url.searchParams.get('payment'), 'paid');
  assert.equal(url.searchParams.get('order'), 'MD-1042');
  assert.equal(url.searchParams.get('id'), 'ord_123');
});

test('a refused or unconfirmed payment says so in the address', () => {
  const state = (paymentStatus) => new URL(storefrontAddress('https://shop.example', 'demo', { ...order, paymentStatus })).searchParams.get('payment');
  assert.equal(state('FAILED'), 'failed');
  assert.equal(state('PENDING'), 'pending');
});

test('an order number with a space or a # survives the trip', () => {
  const url = new URL(storefrontAddress('https://shop.example', 'demo', { ...order, orderNumber: 'MD #7 A' }));
  assert.equal(url.searchParams.get('order'), 'MD #7 A');
});
