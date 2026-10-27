/**
 * A restaurant's own Tap account and the daily check against Tap, end to end over HTTP against a real PostgreSQL
 * and a pretend Tap (a local server answering like Tap's API). No real key and no real Tap are ever used.
 * Needs TEST_DATABASE_URL pointing at a throwaway database (never production); without it the tests are skipped.
 *
 *   TEST_DATABASE_URL=postgresql://... node --test test/tapAccounts.test.js
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB || /supabase|pooler|amazonaws/i.test(DB) ? 'needs TEST_DATABASE_URL (a throwaway database)' : false;

// Obviously fake keys: the pretend Tap accepts only GOOD.
const GOOD = 'sk_test_FAKEGOODKEY000000001';
const WRONG = 'sk_test_FAKEWRONGKEY00000002';

let server;
let base;
let tapServer;
let prisma;
const ids = {};
const charges = new Map();
let nextCharge = 1;

const call = async (method, path, { token, body, tenant = 'tapown', redirect = 'follow' } = {}) => {
  const res = await fetch(`${base}/api${path}`, {
    method,
    redirect,
    headers: { 'content-type': 'application/json', 'x-tenant': tenant, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const week = Array.from({ length: 7 }, (_, day) => ({ day, closed: false, breaks: [], open: '00:00', close: '00:00' }));
const order = (extra = {}) => ({
  customerName: 'Noor',
  customerPhone: '96555551234',
  paymentMethod: 'KNET',
  orderType: 'DELIVERY',
  area: 'Jahra',
  address: 'Block 1',
  items: [{ menuItemId: ids.item, quantity: 2 }],
  ...extra,
});
// A charge as Tap's API describes it.
const tapCharge = (id, { amount, status = 'CAPTURED', orderNumber = null }) => ({
  id,
  amount,
  currency: 'KWD',
  status,
  reference: { order: orderNumber },
  transaction: { created: String(Date.now()), url: `https://pretend-tap.test/pay/${id}` },
  source: { payment_method: 'KNET' },
});

before(async () => {
  if (skip) return;
  // The pretend Tap: checks the key on every call, like Tap does.
  const tap = express();
  tap.use(express.json());
  tap.use((req, res, next) =>
    req.get('authorization') === `Bearer ${GOOD}` ? next() : res.status(401).json({ errors: [{ description: 'Invalid API key' }] }),
  );
  tap.post('/v2/charges/list', (req, res) => {
    const from = Number(req.body?.period?.date?.from || 0);
    const to = Number(req.body?.period?.date?.to || Date.now() + 1e9);
    const list = [...charges.values()].filter(
      (c) => (!req.body.status || c.status === req.body.status) && Number(c.transaction.created) >= from && Number(c.transaction.created) <= to,
    );
    res.json({ object_type: 'list', has_more: false, count: list.length, charges: list.slice(0, req.body.limit || 25) });
  });
  tap.post('/v2/charges', (req, res) => {
    const id = `chg_TS${String(nextCharge++).padStart(6, '0')}`;
    charges.set(id, tapCharge(id, { amount: req.body.amount, status: 'INITIATED', orderNumber: req.body.reference?.order }));
    res.json(charges.get(id));
  });
  tap.get('/v2/charges/:id', (req, res) => (charges.has(req.params.id) ? res.json(charges.get(req.params.id)) : res.status(404).json({})));
  tapServer = await new Promise((resolve) => {
    const s = tap.listen(0, () => resolve(s));
  });

  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.JWT_SECRET = 'test-secret';
  // No platform gateway and no listed restaurant: online payment can only come from a restaurant's own account.
  process.env.PAYMENT_PROVIDER = 'manual';
  process.env.ONLINE_PAYMENT_TENANTS = '';
  delete process.env.TAP_SECRET_KEY;
  delete process.env.ONLINE_PAYMENT_PILOT_PHONES;
  process.env.TAP_BASE_URL = `http://127.0.0.1:${tapServer.address().port}`;
  process.env.API_URL = 'http://api.test';
  process.env.PUBLIC_URL = 'http://shop.test';
  ({ prisma } = await import('../src/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;

  await prisma.tenant.deleteMany({ where: { slug: 'tapown' } });
  await prisma.user.deleteMany({ where: { email: { in: ['owner@tap.test', 'desk@tap.test'] } } });
  const tenant = await prisma.tenant.create({ data: { slug: 'tapown', nameEn: 'Own Tap', nameAr: 'تاب' } });
  const t = tenant.id;
  ids.tenant = t;
  const password = await bcrypt.hash('secret123', 4);
  ids.branch = (await prisma.pickupLocation.create({ data: { tenantId: t, nameEn: 'Jahra', hours: week } })).id;
  await prisma.deliveryZone.create({ data: { tenantId: t, nameEn: 'Jahra', nameAr: 'الجهراء', branchId: ids.branch, deliveryFee: 0.5, minimumOrder: 1 } });
  const category = await prisma.category.create({ data: { tenantId: t, nameEn: 'Mains', nameAr: 'رئيسي', slug: 'mains' } });
  ids.item = (await prisma.menuItem.create({ data: { tenantId: t, nameEn: 'Shawarma', price: 1.5, categoryId: category.id } })).id;
  await prisma.user.create({ data: { tenantId: t, email: 'owner@tap.test', password, name: 'Owner', role: 'ADMIN' } });
  await prisma.user.create({ data: { tenantId: t, email: 'desk@tap.test', password, name: 'Desk', role: 'BRANCH', branchId: ids.branch } });

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  ids.owner = (await call('POST', '/auth/login', { body: { email: 'owner@tap.test', password: 'secret123' } })).body.token;
  ids.desk = (await call('POST', '/auth/login', { body: { email: 'desk@tap.test', password: 'secret123' } })).body.token;
});

after(async () => {
  if (skip) return;
  await prisma.tenant.deleteMany({ where: { slug: 'tapown' } });
  await prisma.user.deleteMany({ where: { email: { in: ['owner@tap.test', 'desk@tap.test'] } } });
  server?.close();
  tapServer?.close();
  await prisma.$disconnect();
});

test('without its own account the restaurant has no online payment, and only the owner sees the settings', { skip }, async () => {
  const settings = await call('GET', '/settings/payment', { token: ids.owner });
  assert.equal(settings.status, 200);
  assert.deepEqual([settings.body.account, settings.body.enabled], ['none', false]);
  assert.equal((await call('GET', '/settings/payment', { token: ids.desk })).status, 403);
});

test('a key is checked with Tap before it is saved; a refused key is never stored', { skip }, async () => {
  assert.equal((await call('PUT', '/settings/payment', { token: ids.owner, body: { secretKey: 'pk_live_public' } })).status, 400);
  const refused = await call('PUT', '/settings/payment', { token: ids.owner, body: { secretKey: WRONG } });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /Tap did not accept this key/);
  assert.equal((await prisma.tenant.findUnique({ where: { id: ids.tenant } })).tapSecretKey, null);

  const saved = await call('PUT', '/settings/payment', { token: ids.owner, body: { secretKey: GOOD } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual([saved.body.account, saved.body.mode, saved.body.keyHint, saved.body.enabled], ['own', 'test', 'sk_test_…0001', true]);
  const stored = (await prisma.tenant.findUnique({ where: { id: ids.tenant } })).tapSecretKey;
  assert.ok(stored && !stored.includes('FAKEGOODKEY'), 'stored encrypted');
});

test('the key never leaves the server: not in the public restaurant, not in the settings', { skip }, async () => {
  const pub = await call('GET', '/tenants/current');
  const settings = await call('GET', '/settings/payment', { token: ids.owner });
  for (const body of [pub.body, settings.body]) assert.ok(!JSON.stringify(body).includes('FAKEGOODKEY'));
  assert.equal(pub.body.tapSecretKey, undefined);
});

test("a customer pays through the restaurant's own account, and Tap's notice is checked with that account", { skip }, async () => {
  const placed = await call('POST', '/orders', { body: order() });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  assert.equal(placed.body.paymentStatus, 'PENDING');
  assert.match(placed.body.paymentUrl, /pretend-tap\.test/);
  const charge = [...charges.values()].find((c) => c.reference.order === placed.body.orderNumber);
  charge.status = 'CAPTURED';
  // Tap sends the customer back; the server reads the charge from Tap with the restaurant's key.
  const back = await fetch(`${base}/api/payments/tap/callback?tap_id=${charge.id}`, { redirect: 'manual' });
  assert.equal(back.status, 302);
  const paid = await prisma.order.findUnique({ where: { id: placed.body.id } });
  assert.equal(paid.paymentStatus, 'PAID');
  ids.paidOrder = paid;
});

test('the daily check finds every kind of difference with Tap', { skip }, async () => {
  // Tap took this one, but its notice never reached us.
  const lost = await call('POST', '/orders', { body: order() });
  const lostCharge = [...charges.values()].find((c) => c.reference.order === lost.body.orderNumber);
  lostCharge.status = 'CAPTURED';
  ids.lostCharge = lostCharge.id;
  // Marked paid here with an amount Tap does not agree with.
  const differs = await prisma.order.create({
    data: { tenantId: ids.tenant, branchId: ids.branch, orderNumber: 'DIFF-1', customerName: 'A', customerPhone: '55551234', subtotal: 5, total: 5, paymentProvider: 'tap', paymentStatus: 'PAID', paymentRef: 'chg_TSDIFF', paidAt: new Date() },
  });
  charges.set('chg_TSDIFF', tapCharge('chg_TSDIFF', { amount: 4, orderNumber: differs.orderNumber }));
  // Marked paid here, unknown to Tap.
  await prisma.order.create({
    data: { tenantId: ids.tenant, branchId: ids.branch, orderNumber: 'MISSING-1', customerName: 'A', customerPhone: '55551234', subtotal: 2, total: 2, paymentProvider: 'tap', paymentStatus: 'PAID', paymentRef: 'chg_TSNOWHERE', paidAt: new Date() },
  });
  // Captured by Tap with no order here at all.
  charges.set('chg_TSSTRAY', tapCharge('chg_TSSTRAY', { amount: 9 }));

  const { status, body } = await call('GET', '/reports/closing/tap', { token: ids.owner });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.available, true);
  assert.equal(body.ok, false);
  assert.deepEqual(body.matched.map((r) => r.orderNumber), [ids.paidOrder.orderNumber]);
  assert.deepEqual(body.amountDiffers.map((r) => [r.orderNumber, r.amount, r.tapAmount]), [['DIFF-1', 5, 4]]);
  assert.deepEqual(body.notInTap.map((r) => r.orderNumber), ['MISSING-1']);
  assert.deepEqual(body.notPaidHere.map((r) => r.reference), [ids.lostCharge]);
  assert.deepEqual(body.unknown.map((r) => r.reference), ['chg_TSSTRAY']);
});

test('a branch sees its own payments only, never Tap payments that belong to no order', { skip }, async () => {
  const { body } = await call('GET', '/reports/closing/tap', { token: ids.desk });
  assert.deepEqual(body.unknown, []);
  assert.deepEqual(body.notPaidHere.map((r) => r.reference), [ids.lostCharge]);
});

test('a payment whose notice was lost is recorded by staff after Tap confirms it, and then matches', { skip }, async () => {
  assert.equal((await call('POST', `/reports/closing/tap/${ids.lostCharge}/record`, { token: ids.desk })).status, 403);
  const recorded = await call('POST', `/reports/closing/tap/${ids.lostCharge}/record`, { token: ids.owner });
  assert.equal(recorded.status, 200, JSON.stringify(recorded.body));
  assert.equal(recorded.body.paymentStatus, 'PAID');
  assert.equal((await call('POST', '/reports/closing/tap/chg_TSSTRAY/record', { token: ids.owner })).status, 404);
  const { body } = await call('GET', '/reports/closing/tap', { token: ids.owner });
  assert.deepEqual(body.notPaidHere, []);
  assert.ok(body.matched.some((r) => r.reference === ids.lostCharge));
});

test('removing the key switches online payment off again', { skip }, async () => {
  const removed = await call('DELETE', '/settings/payment', { token: ids.owner });
  assert.deepEqual([removed.body.account, removed.body.enabled], ['none', false]);
  assert.equal((await call('GET', '/reports/closing/tap', { token: ids.owner })).body.available, false);
});
