/**
 * The new-restaurant checklist in the platform console, over HTTP against a real PostgreSQL.
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

const call = async (method, path, token) => {
  const res = await fetch(`${base}/api${path}`, { method, headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const statusOf = (steps) => Object.fromEntries(steps.map((s) => [s.key, s.status]));

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.JWT_SECRET = 'test-secret';
  ({ prisma } = await import('../src/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;
  await prisma.tenant.deleteMany({ where: { slug: 'setuptest' } });
  await prisma.user.deleteMany({ where: { email: { in: ['platform@setup.test', 'owner@setup.test'] } } });
  const password = await bcrypt.hash('secret123', 4);
  await prisma.user.create({ data: { email: 'platform@setup.test', password, name: 'Platform', role: 'ADMIN', tenantId: null } });
  ids.tenant = (await prisma.tenant.create({ data: { slug: 'setuptest', nameEn: 'Setup', nameAr: 'إعداد' } })).id;
  await prisma.user.create({ data: { email: 'owner@setup.test', password, name: 'Owner', role: 'ADMIN', tenantId: ids.tenant } });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const login = async (email) =>
    (
      await (
        await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123' }) })
      ).json()
    ).token;
  ids.platform = await login('platform@setup.test');
  ids.owner = await login('owner@setup.test');
});

after(async () => {
  if (skip) return;
  await prisma.tenant.deleteMany({ where: { slug: 'setuptest' } });
  await prisma.user.deleteMany({ where: { email: { in: ['platform@setup.test', 'owner@setup.test'] } } });
  server?.close();
  await prisma.$disconnect();
});

test('a brand-new restaurant: only its owner is done; the essentials are missing', { skip }, async () => {
  const { status, body } = await call('GET', `/tenants/${ids.tenant}/setup`, ids.platform);
  assert.equal(status, 200, JSON.stringify(body));
  const s = statusOf(body);
  assert.equal(s.owner, 'done');
  assert.deepEqual([s.branches, s.menu], ['missing', 'missing']);
  assert.equal(s.logo, 'advice');
});

test('as the restaurant is set up, its steps turn done', { skip }, async () => {
  const week = Array.from({ length: 7 }, (_, day) => ({ day, closed: false, breaks: [], open: '09:00', close: '23:00' }));
  const branch = await prisma.pickupLocation.create({ data: { tenantId: ids.tenant, nameEn: 'Jahra', hours: week } });
  await prisma.deliveryZone.create({ data: { tenantId: ids.tenant, nameEn: 'Jahra', nameAr: 'الجهراء', branchId: branch.id } });
  const category = await prisma.category.create({ data: { tenantId: ids.tenant, nameEn: 'Mains', nameAr: 'رئيسي', slug: 'mains' } });
  await prisma.menuItem.create({ data: { tenantId: ids.tenant, nameEn: 'Shawarma', price: 1, categoryId: category.id } });
  const s = statusOf((await call('GET', `/tenants/${ids.tenant}/setup`, ids.platform)).body);
  assert.deepEqual([s.branches, s.zones, s.menu], ['done', 'done', 'done']);
  assert.equal(s.pictures, 'advice', 'an item without a picture is pointed out');
  assert.equal(s.branchAccounts, 'advice', 'the branch has no login yet');
});

test('only the platform owner sees a restaurant\'s setup', { skip }, async () => {
  assert.equal((await call('GET', `/tenants/${ids.tenant}/setup`, ids.owner)).status, 403);
});
