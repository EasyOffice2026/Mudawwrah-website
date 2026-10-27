/**
 * The daily closing sheet, over HTTP against a real PostgreSQL.
 * Needs TEST_DATABASE_URL pointing at a throwaway database (never production); without it the tests are skipped.
 *
 *   TEST_DATABASE_URL=postgresql://... node --test test/closing.test.js
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB || /supabase|pooler|amazonaws/i.test(DB) ? 'needs TEST_DATABASE_URL (a throwaway database)' : false;

let server;
let base;
let prisma;
const ids = {};

const get = async (path, token) => {
  const res = await fetch(`${base}/api${path}`, { headers: { 'x-tenant': 'closetest', authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// Kuwait is UTC+3 all year: 2026-10-25 runs from 2026-10-24T21:00Z to 2026-10-25T21:00Z.
const at = (iso) => new Date(iso);

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.JWT_SECRET = 'test-secret';
  ({ prisma } = await import('../src/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;

  await prisma.tenant.deleteMany({ where: { slug: 'closetest' } });
  await prisma.user.deleteMany({ where: { email: { in: ['owner@close.test', 'jahra@close.test'] } } });
  const tenant = await prisma.tenant.create({ data: { slug: 'closetest', nameEn: 'Close Test', nameAr: 'اختبار' } });
  const t = tenant.id;
  const password = await bcrypt.hash('secret123', 4);
  ids.jahra = (await prisma.pickupLocation.create({ data: { tenantId: t, nameEn: 'Al Jahra' } })).id;
  ids.sabah = (await prisma.pickupLocation.create({ data: { tenantId: t, nameEn: 'Sabah' } })).id;
  await prisma.user.create({ data: { tenantId: t, email: 'owner@close.test', password, name: 'Owner', role: 'ADMIN' } });
  await prisma.user.create({ data: { tenantId: t, email: 'jahra@close.test', password, name: 'Jahra', role: 'BRANCH', branchId: ids.jahra } });

  let n = 0;
  const order = (data) =>
    prisma.order.create({
      data: { tenantId: t, orderNumber: `C-${(n += 1)}`, customerName: 'Noor', customerPhone: '55551234', subtotal: data.total, ...data },
    });
  // The day: two KNET at Jahra (one at 00:30 Kuwait time, inside the day), one Apple Pay at Sabah, one refund needed.
  await order({ total: 4.5, branchId: ids.jahra, paymentMethod: 'KNET', paymentStatus: 'PAID', paymentRef: 'chg_A', paidAt: at('2026-10-24T21:30:00Z'), status: 'DELIVERED' });
  await order({ total: 2.25, branchId: ids.jahra, paymentMethod: 'KNET', paymentStatus: 'PAID', paymentRef: 'chg_B', paidAt: at('2026-10-25T10:00:00Z'), status: 'DELIVERED' });
  await order({ total: 3, branchId: ids.sabah, paymentMethod: 'APPLE_PAY', paymentStatus: 'PAID', paymentRef: 'chg_C', paidAt: at('2026-10-25T12:00:00Z'), status: 'DELIVERED' });
  await order({ total: 1.5, branchId: ids.sabah, paymentMethod: 'KNET', paymentStatus: 'PAID', paymentRef: 'chg_D', paidAt: at('2026-10-25T13:00:00Z'), status: 'CANCELLED' });
  // Not the day: paid the evening before (20:59Z = 23:59 Kuwait time on the 24th).
  await order({ total: 9, branchId: ids.jahra, paymentMethod: 'KNET', paymentStatus: 'PAID', paymentRef: 'chg_X', paidAt: at('2026-10-24T20:59:00Z'), status: 'DELIVERED' });
  // Not paid online that day: one kept, one cancelled (left out), one still waiting for its payment (left out).
  await order({ total: 6, branchId: ids.jahra, paymentMethod: 'KNET', paymentStatus: 'UNPAID', status: 'DELIVERED', createdAt: at('2026-10-25T09:00:00Z') });
  await order({ total: 7, branchId: ids.jahra, paymentMethod: 'KNET', paymentStatus: 'UNPAID', status: 'CANCELLED', createdAt: at('2026-10-25T09:00:00Z') });
  await order({ total: 8, branchId: ids.jahra, paymentMethod: 'KNET', paymentStatus: 'PENDING', createdAt: at('2026-10-25T09:00:00Z') });

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const login = async (email) =>
    (
      await (
        await fetch(`${base}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password: 'secret123' }),
        })
      ).json()
    ).token;
  ids.owner = await login('owner@close.test');
  ids.jahraDesk = await login('jahra@close.test');
});

after(async () => {
  if (skip) return;
  await prisma.tenant.deleteMany({ where: { slug: 'closetest' } });
  await prisma.user.deleteMany({ where: { email: { in: ['owner@close.test', 'jahra@close.test'] } } });
  server?.close();
  await prisma.$disconnect();
});

test("the owner's sheet lists the day's payments in order, with the Tap reference, totals per method and per branch", { skip }, async () => {
  const { status, body } = await get('/reports/closing?date=2026-10-25', ids.owner);
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.payments.map((p) => p.reference), ['chg_A', 'chg_B', 'chg_C', 'chg_D']);
  assert.equal(body.totals.count, 4);
  assert.equal(body.totals.total, 11.25);
  assert.deepEqual(body.totals.byMethod, { KNET: { count: 3, total: 8.25 }, APPLE_PAY: { count: 1, total: 3 } });
  assert.deepEqual(
    body.totals.byBranch.map((b) => [b.branch.nameEn, b.count, b.total]).sort(),
    [['Al Jahra', 2, 6.75], ['Sabah', 2, 4.5]],
  );
});

test('a payment for an order cancelled afterwards is money taken, flagged for a refund', { skip }, async () => {
  const { body } = await get('/reports/closing?date=2026-10-25', ids.owner);
  assert.deepEqual(body.payments.filter((p) => p.refundNeeded).map((p) => p.reference), ['chg_D']);
  assert.deepEqual(body.totals.refundNeeded, { count: 1, total: 1.5 });
  assert.equal(body.totals.net, 9.75);
});

test('orders that day not paid online are counted apart; cancelled ones and ones still awaiting payment are not', { skip }, async () => {
  const { body } = await get('/reports/closing?date=2026-10-25', ids.owner);
  assert.deepEqual(body.notPaidOnline, { count: 1, total: 6 });
});

test("a branch account closes its own branch only, whatever branch it asks for", { skip }, async () => {
  const own = await get('/reports/closing?date=2026-10-25', ids.jahraDesk);
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.payments.map((p) => p.reference), ['chg_A', 'chg_B']);
  const other = await get(`/reports/closing?date=2026-10-25&branchId=${ids.sabah}`, ids.jahraDesk);
  assert.deepEqual(other.body.payments.map((p) => p.reference), ['chg_A', 'chg_B']);
});

test('the owner can close one branch, and a bad date is refused', { skip }, async () => {
  const sabah = await get(`/reports/closing?date=2026-10-25&branchId=${ids.sabah}`, ids.owner);
  assert.deepEqual(sabah.body.payments.map((p) => p.reference), ['chg_C', 'chg_D']);
  assert.equal((await get('/reports/closing?date=25-10-2026', ids.owner)).status, 400);
});
