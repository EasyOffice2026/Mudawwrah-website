import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { buildOrderPayload, mapStatus, shouldPushNow, verifyWebhook } from '../src/services/foodicsService.js';

const order = {
  id: 'o1',
  orderNumber: 'MD-1001',
  orderType: 'DELIVERY',
  customerName: 'Sara',
  customerPhone: '96550000000',
  area: 'Salmiya',
  block: '4',
  street: 'Salem Al Mubarak',
  building: '12',
  address: null,
  notes: 'ring the bell',
  deliveryNote: null,
  cutlery: true,
  channel: 'WHATSAPP',
  paymentMethod: 'CASH',
  paymentStatus: 'PENDING',
  discount: 0,
  deliveryFee: 1,
  total: 6.5,
  deliveryLat: 29.33,
  deliveryLng: 48.07,
  items: [
    {
      menuItemId: 'm1',
      nameEn: 'Chicken Mdawra',
      quantity: 2,
      unitPrice: 2.75,
      customizations: [
        { id: 'c1', nameEn: 'Extra garlic' },
        { id: 'c2', nameEn: 'No pickles' },
      ],
    },
  ],
};

test('buildOrderPayload maps items and options, notes unmapped options', () => {
  const payload = buildOrderPayload(order, {
    branchId: 'branch-1',
    products: new Map([['m1', 'fp-1']]),
    options: new Map([['c1', 'fo-1']]),
  });
  assert.equal(payload.branch_id, 'branch-1');
  assert.equal(payload.type, 3);
  assert.equal(payload.reference, 'MD-1001');
  assert.deepEqual(payload.customer, { name: 'Sara', phone: '96550000000' });
  assert.equal(payload.delivery_address.latitude, 29.33);
  assert.match(payload.delivery_address.description, /Salmiya, Block 4/);
  assert.deepEqual(payload.products, [{ product_id: 'fp-1', quantity: 2, unit_price: 2.75, options: [{ modifier_option_id: 'fo-1', quantity: 1 }] }]);
  assert.match(payload.kitchen_notes, /ring the bell/);
  assert.match(payload.kitchen_notes, /Cutlery requested/);
  assert.match(payload.kitchen_notes, /Chicken Mdawra: No pickles/);
  assert.equal(payload.delivery_charge, 1);
});

test('buildOrderPayload refuses items without a Foodics product', () => {
  assert.throws(
    () => buildOrderPayload(order, { branchId: 'b', products: new Map(), options: new Map() }),
    /No Foodics product mapped for: Chicken Mdawra/,
  );
});

test('pickup orders carry no address and use the pickup type', () => {
  const payload = buildOrderPayload(
    { ...order, orderType: 'PICKUP' },
    { branchId: 'b', products: new Map([['m1', 'fp-1']]), options: new Map() },
  );
  assert.equal(payload.type, 2);
  assert.equal(payload.delivery_address, undefined);
});

test('shouldPushNow waits for online payment but not for cash', () => {
  assert.equal(shouldPushNow({ paymentMethod: 'CASH', paymentStatus: 'PENDING' }), true);
  assert.equal(shouldPushNow({ paymentMethod: 'WHATSAPP', paymentStatus: 'PENDING' }), true);
  assert.equal(shouldPushNow({ paymentMethod: 'KNET', paymentStatus: 'PENDING' }), false);
  assert.equal(shouldPushNow({ paymentMethod: 'KNET', paymentStatus: 'PAID' }), true);
  assert.equal(shouldPushNow({ paymentMethod: 'APPLE_PAY', paymentStatus: 'FAILED' }), false);
});

test('mapStatus handles numeric and named Foodics statuses', () => {
  assert.equal(mapStatus(2), 'PREPARING');
  assert.equal(mapStatus('4'), 'DELIVERED');
  assert.equal(mapStatus(3), 'CANCELLED');
  assert.equal(mapStatus('ready'), 'READY');
  assert.equal(mapStatus('Closed'), 'DELIVERED');
  assert.equal(mapStatus(8), null);
  assert.equal(mapStatus(undefined), null);
});

test('verifyWebhook accepts the shared secret or an HMAC of the body', () => {
  const tenant = { foodicsWebhookSecret: 's3cret' };
  const rawBody = Buffer.from('{"id":"x"}');
  assert.equal(verifyWebhook(tenant, { secretHeader: 's3cret' }), true);
  assert.equal(verifyWebhook(tenant, { secretHeader: 'wrong' }), false);
  const sig = crypto.createHmac('sha256', 's3cret').update(rawBody).digest('hex');
  assert.equal(verifyWebhook(tenant, { rawBody, signatureHeader: `sha256=${sig}` }), true);
  assert.equal(verifyWebhook(tenant, { rawBody, signatureHeader: 'deadbeef' }), false);
  assert.equal(verifyWebhook({ foodicsWebhookSecret: null }, { secretHeader: 's3cret' }), false);
});
