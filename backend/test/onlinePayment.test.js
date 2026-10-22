import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.PAYMENT_PROVIDER = 'tap';
process.env.TAP_SECRET_KEY = 'sk_test_unit';
process.env.ONLINE_PAYMENT_TENANTS = ' Mdawra ';
process.env.PUBLIC_URL = 'https://www.madawarah.com';
process.env.API_URL = 'https://api.example.com/';
const { isOnlinePaymentEnabled, startPayment } = await import('../src/services/payment/index.js');
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
