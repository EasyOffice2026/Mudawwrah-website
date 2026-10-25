/**
 * Customer feedback stays with its own restaurant, over HTTP against a real PostgreSQL.
 * Needs TEST_DATABASE_URL pointing at a throwaway database (never production); without it the test is skipped.
 *
 *   TEST_DATABASE_URL=postgresql://... node --test test/feedback.test.js
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB || /supabase|pooler|amazonaws/i.test(DB) ? 'needs TEST_DATABASE_URL (a throwaway database)' : false;

let server;
let base;
let prisma;
let ownerToken;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.JWT_SECRET = 'test-secret';
  ({ prisma } = await import('../src/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;

  await prisma.tenant.deleteMany({ where: { slug: { in: ['fbmine', 'fbother'] } } });
  await prisma.user.deleteMany({ where: { email: 'owner@fb.test' } });
  const mine = await prisma.tenant.create({ data: { slug: 'fbmine', nameEn: 'Mine', nameAr: 'لي' } });
  const other = await prisma.tenant.create({ data: { slug: 'fbother', nameEn: 'Other', nameAr: 'آخر' } });
  const password = await bcrypt.hash('secret123', 4);
  await prisma.user.create({ data: { tenantId: mine.id, email: 'owner@fb.test', password, name: 'Owner', role: 'ADMIN' } });

  const rated = async (tenantId, orderNumber, rating, comment) => {
    const order = await prisma.order.create({
      data: { tenantId, orderNumber, customerName: 'Noor', customerPhone: '55551234', subtotal: 2, total: 2 },
    });
    await prisma.orderFeedback.create({ data: { orderId: order.id, phone: '55551234', rating, comment } });
  };
  await rated(mine.id, 'MINE-1', 5, 'Lovely');
  await rated(other.id, 'OTHER-1', 1, 'Another restaurant’s customer');

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@fb.test', password: 'secret123' }),
  });
  ownerToken = (await login.json()).token;
});

after(async () => {
  if (skip) return;
  await prisma.tenant.deleteMany({ where: { slug: { in: ['fbmine', 'fbother'] } } });
  await prisma.user.deleteMany({ where: { email: 'owner@fb.test' } });
  server?.close();
  await prisma.$disconnect();
});

test('a restaurant sees only feedback on its own orders, and its average only from them', { skip }, async () => {
  const res = await fetch(`${base}/api/feedback`, { headers: { authorization: `Bearer ${ownerToken}`, 'x-tenant': 'fbmine' } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 1);
  assert.deepEqual(body.data.map((f) => f.order.orderNumber), ['MINE-1']);
  assert.equal(body.averageRating, 5);
});
