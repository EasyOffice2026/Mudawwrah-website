import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

process.env.TAP_SECRET_KEY = 'sk_test_unit';
const tap = await import('../src/services/payment/tap.js');

const order = {
  id: 'ord-1',
  orderNumber: 'MDW-0001',
  total: '7.600',
  customerName: 'Noor Al Sabah',
  customerPhone: '96555551234',
};

let calls;
const realFetch = globalThis.fetch;
const answer = (status, body) => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    return { ok: status < 400, status, json: async () => body };
  };
};

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('opens a Tap charge for the order total with every payment method, and returns its page', async () => {
  answer(200, { id: 'chg_1', status: 'INITIATED', transaction: { url: 'https://checkout.tap.company/?token=x' } });
  const link = await tap.createPaymentLink({ order, lang: 'ar', callbackUrl: 'https://api.test/cb' });

  assert.deepEqual(link, { url: 'https://checkout.tap.company/?token=x', reference: 'chg_1' });
  const [call] = calls;
  assert.equal(call.url, 'https://api.tap.company/v2/charges');
  assert.equal(call.init.headers.Authorization, 'Bearer sk_test_unit');
  assert.equal(call.body.amount, 7.6);
  assert.equal(call.body.currency, 'KWD');
  assert.equal(call.body.source.id, 'src_all');
  assert.deepEqual(call.body.customer.phone, { country_code: '965', number: '55551234' });
  assert.equal(call.body.customer.first_name, 'Noor');
  assert.equal(call.body.customer.last_name, 'Al Sabah');
  assert.equal(call.body.redirect.url, 'https://api.test/cb');
  assert.equal(call.body.post.url, 'https://api.test/cb');
  assert.equal(call.body.reference.order, 'MDW-0001');
  assert.equal(call.body.metadata.udf1, 'ar');
  // The marketplace merchant is only sent when one is configured.
  assert.equal(call.body.merchant, undefined);
});

test('says why Tap refused, and does not invent a payment page', async () => {
  answer(400, { errors: [{ code: '1105', description: 'Invalid amount' }] });
  await assert.rejects(
    tap.createPaymentLink({ order, lang: 'en', callbackUrl: 'https://api.test/cb' }),
    /Invalid amount/,
  );
  answer(200, { id: 'chg_2', status: 'INITIATED' });
  await assert.rejects(
    tap.createPaymentLink({ order, lang: 'en', callbackUrl: 'https://api.test/cb' }),
    /did not return a payment page/,
  );
});

test('only a captured charge is paid; a refused, cancelled or abandoned one has failed', async () => {
  const statusOf = async (tapStatus) => {
    answer(200, { id: 'chg_3', status: tapStatus, amount: 7.6, currency: 'KWD' });
    return tap.getPaymentStatus({ paymentId: 'chg_3' });
  };
  assert.deepEqual(
    [await statusOf('CAPTURED')].map((s) => [s.paid, s.failed, s.amount, s.currency, s.reference]),
    [[true, false, 7.6, 'KWD', 'chg_3']],
  );
  for (const waiting of ['INITIATED', 'IN_PROGRESS']) {
    const s = await statusOf(waiting);
    assert.deepEqual([s.paid, s.failed], [false, false], waiting);
  }
  for (const failed of ['DECLINED', 'CANCELLED', 'ABANDONED', 'FAILED', 'TIMEDOUT', 'VOID', 'RESTRICTED']) {
    const s = await statusOf(failed);
    assert.deepEqual([s.paid, s.failed], [false, true], failed);
  }
  assert.equal(calls.at(-1).url, 'https://api.tap.company/v2/charges/chg_3');
  assert.equal(calls.at(-1).init.method, 'GET');
});

test('is configured only with a secret key', () => {
  assert.equal(tap.isConfigured(), true);
  assert.equal(tap.name, 'tap');
});
