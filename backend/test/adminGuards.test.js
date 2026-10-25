/**
 * Menu ordering stays inside one restaurant, and the late-order monitor, over HTTP against a real PostgreSQL.
 * Needs TEST_DATABASE_URL pointing at a throwaway database (never production); without it the tests are skipped.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB || /supabase|pooler|amazonaws/i.test(DB) ? 'needs TEST_DATABASE_URL (a throwaway database)' : false;

let server;
let base;
let prisma;
const ids = {};

const call = async (method, path, { token, body, tenant = 'guardmine' } = {}) => {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-tenant': tenant, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.JWT_SECRET = 'test-secret';
  ({ prisma } = await import('../src/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;

  await prisma.tenant.deleteMany({ where: { slug: { in: ['guardmine', 'guardother'] } } });
  await prisma.user.deleteMany({ where: { email: 'owner@guard.test' } });
  const mine = await prisma.tenant.create({ data: { slug: 'guardmine', nameEn: 'Mine', nameAr: 'لي' } });
  const other = await prisma.tenant.create({ data: { slug: 'guardother', nameEn: 'Other', nameAr: 'آخر' } });
  ids.mine = mine.id;
  const password = await bcrypt.hash('secret123', 4);
  await prisma.user.create({ data: { tenantId: mine.id, email: 'owner@guard.test', password, name: 'Owner', role: 'ADMIN' } });
  const category = (tenantId, slug) => prisma.category.create({ data: { tenantId, nameEn: slug, nameAr: slug, slug } });
  ids.mineA = (await category(mine.id, 'a')).id;
  ids.mineB = (await category(mine.id, 'b')).id;
  ids.otherA = (await category(other.id, 'a')).id;
  ids.item = (await prisma.menuItem.create({ data: { tenantId: mine.id, nameEn: 'Tea', price: 0.2, categoryId: ids.mineA } })).id;
  ids.otherItem = (await prisma.menuItem.create({ data: { tenantId: other.id, nameEn: 'Coffee', price: 0.3, categoryId: ids.otherA } })).id;

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  ids.owner = (await call('POST', '/auth/login', { body: { email: 'owner@guard.test', password: 'secret123' } })).body.token;
});

after(async () => {
  if (skip) return;
  await prisma.tenant.deleteMany({ where: { slug: { in: ['guardmine', 'guardother'] } } });
  await prisma.user.deleteMany({ where: { email: 'owner@guard.test' } });
  server?.close();
  await prisma.$disconnect();
});

test("a restaurant reorders its own categories and items, never another restaurant's", { skip }, async () => {
  const ok = await call('POST', '/categories/reorder', { token: ids.owner, body: { orderedIds: [ids.mineB, ids.mineA] } });
  assert.ok(ok.status < 300, JSON.stringify(ok.body));
  const foreign = await call('POST', '/categories/reorder', { token: ids.owner, body: { orderedIds: [ids.otherA, ids.mineA] } });
  assert.equal(foreign.status, 400);
  const foreignItem = await call('POST', '/items/reorder', { token: ids.owner, body: { orderedIds: [ids.otherItem] } });
  assert.equal(foreignItem.status, 400);
  const untouched = await prisma.category.findUnique({ where: { id: ids.otherA } });
  assert.equal(untouched.displayOrder, 0);
});

test('the monitor check is calm until an order has waited 15 minutes unaccepted', { skip }, async () => {
  assert.deepEqual(await call('GET', '/health/orders'), { status: 200, body: { status: 'ok' } });
  const order = (orderNumber, minutesAgo, extra = {}) =>
    prisma.order.create({
      data: { tenantId: ids.mine, orderNumber, customerName: 'A', customerPhone: '55551234', subtotal: 1, total: 1, createdAt: new Date(Date.now() - minutesAgo * 60_000), ...extra },
    });
  await order('NEW-1', 5);
  await order('UNPAID-1', 40, { paymentStatus: 'PENDING' });
  assert.equal((await call('GET', '/health/orders')).status, 200, 'a fresh order, or one waiting for its payment, is not late');
  await order('LATE-1', 20);
  assert.deepEqual(await call('GET', '/health/orders'), { status: 503, body: { status: 'orders waiting too long' } });
  assert.equal((await call('GET', '/health/orders', { tenant: 'guardother' })).status, 200, 'each restaurant is watched on its own');
});
