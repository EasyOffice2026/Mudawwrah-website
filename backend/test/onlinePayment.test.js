import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.PAYMENT_PROVIDER = 'tap';
process.env.TAP_SECRET_KEY = 'sk_test_unit';
process.env.ONLINE_PAYMENT_TENANTS = ' Mdawra ';
process.env.PUBLIC_URL = 'https://www.madawarah.com';
process.env.API_URL = 'https://api.example.com/';
const { isOnlinePaymentEnabled, startPayment } = await import('../src/services/payment/index.js');
const { create: createOrder, skipsPayment } = await import('../src/services/orderService.js');
const { runWithTenant } = await import('../src/tenantContext.js');
const { config } = await import('../src/config.js');

const as = (slug, fn) => runWithTenant(slug ? { id: `t-${slug}`, slug } : null, fn);

test('online payment is on only for the restaurants listed', () => {
  assert.equal(as('mdawra', isOnlinePaymentEnabled), true);
  assert.equal(as('khobzt-marie', isOnlinePaymentEnabled), false);
  assert.equal(as(null, isOnlinePaymentEnabled), false);
});

test('a restaurant that is not listed never gets a payment page, even with the gateway configured', async () => {
  const order = { id: 'o1', orderNumber: 'X-1', total: '3.000', customerName: 'A', customerPhone: '55551234' };
  assert.equal(await as('khobzt-marie', () => startPayment(order)), null);
});

test('with nobody listed, nobody takes online payment', async () => {
  const saved = [...config.payment.tenants];
  config.payment.tenants.length = 0;
  assert.equal(as('mdawra', isOnlinePaymentEnabled), false);
  config.payment.tenants.push(...saved);
});

test('the gateway calls back to the API, not to the storefront', () => {
  assert.equal(config.apiUrl, 'https://api.example.com');
  assert.equal(config.publicUrl, 'https://www.madawarah.com');
});

test('while a pilot list is set, only those phones are sent to the payment page', () => {
  const saved = [...config.payment.pilotPhones];
  config.payment.pilotPhones.push('55551234');
  try {
    assert.equal(as('mdawra', () => isOnlinePaymentEnabled('55551234')), true);
    // however the number was typed: country code, spaces, plus sign
    assert.equal(as('mdawra', () => isOnlinePaymentEnabled('+965 5555 1234')), true);
    assert.equal(as('mdawra', () => isOnlinePaymentEnabled('99887766')), false);
    // asked about the restaurant as a whole (no customer), the pilot does not hide the feature
    assert.equal(as('mdawra', () => isOnlinePaymentEnabled()), true);
    // a restaurant that is not listed stays off, pilot or not
    assert.equal(as('khobzt-marie', () => isOnlinePaymentEnabled('55551234')), false);
  } finally {
    config.payment.pilotPhones.length = 0;
    config.payment.pilotPhones.push(...saved);
  }
});

test('with no pilot list, every customer of a listed restaurant is sent to the payment page', () => {
  assert.equal(config.payment.pilotPhones.length, 0);
  assert.equal(as('mdawra', () => isOnlinePaymentEnabled('99887766')), true);
});

test('a customer outside the pilot gets no payment page from startPayment either', async () => {
  const saved = [...config.payment.pilotPhones];
  config.payment.pilotPhones.push('55551234');
  try {
    const order = { id: 'o2', orderNumber: 'X-2', total: '3.000', customerName: 'A', customerPhone: '99887766' };
    assert.equal(await as('mdawra', () => startPayment(order)), null);
  } finally {
    config.payment.pilotPhones.length = 0;
    config.payment.pilotPhones.push(...saved);
  }
});

test('"Order via WhatsApp" is refused where the customer must pay online: it would hand the order over unpaid', async () => {
  const order = { channel: 'WEB', paymentMethod: 'WHATSAPP', customerPhone: '99887766', items: [{ menuItemId: 'x', quantity: 1 }] };
  await assert.rejects(
    as('mdawra', () => createOrder(order)),
    (error) => error.status === 409 && /pay online/.test(error.message),
  );
});

test('during the pilot only the pilot phones lose "Order via WhatsApp"; a restaurant without online payment keeps it', async () => {
  const saved = [...config.payment.pilotPhones];
  config.payment.pilotPhones.push('55551234');
  try {
    const order = (phone) => ({ channel: 'WEB', paymentMethod: 'WHATSAPP', customerPhone: phone });
    assert.equal(as('mdawra', () => skipsPayment(order('55551234'))), true);
    assert.equal(as('mdawra', () => skipsPayment(order('99887766'))), false);
    assert.equal(as('khobzt-marie', () => skipsPayment(order('55551234'))), false);
    // The WhatsApp bot has its own payment step; only the website button is a way round paying.
    assert.equal(as('mdawra', () => skipsPayment({ ...order('55551234'), channel: 'WHATSAPP' })), false);
  } finally {
    config.payment.pilotPhones.length = 0;
    config.payment.pilotPhones.push(...saved);
  }
});
