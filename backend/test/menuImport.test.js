/**
 * Importing a menu from a spreadsheet, over HTTP against a real PostgreSQL.
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

const call = async (method, path, { token, body, tenant = 'importtest' } = {}) => {
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
  await prisma.tenant.deleteMany({ where: { slug: { in: ['importtest', 'importother'] } } });
  await prisma.user.deleteMany({ where: { email: 'owner@import.test' } });
  const tenant = await prisma.tenant.create({ data: { slug: 'importtest', nameEn: 'Import', nameAr: 'استيراد' } });
  const other = await prisma.tenant.create({ data: { slug: 'importother', nameEn: 'Other', nameAr: 'آخر' } });
  ids.tenant = tenant.id;
  // An existing category and item, to be matched (not duplicated) by the import.
  const mains = await prisma.category.create({ data: { tenantId: tenant.id, nameEn: 'Sandwiches', nameAr: 'سندويشات', slug: 'sandwiches' } });
  ids.shawarma = (await prisma.menuItem.create({ data: { tenantId: tenant.id, nameEn: 'Shawarma', nameAr: 'شاورما', price: 0.75, categoryId: mains.id } })).id;
  // Another restaurant's item of the same name must never be touched.
  const otherCat = await prisma.category.create({ data: { tenantId: other.id, nameEn: 'Sandwiches', nameAr: 'سندويشات', slug: 'sandwiches' } });
  ids.otherShawarma = (await prisma.menuItem.create({ data: { tenantId: other.id, nameEn: 'Shawarma', price: 0.5, categoryId: otherCat.id } })).id;
  await prisma.user.create({ data: { tenantId: tenant.id, email: 'owner@import.test', password: await bcrypt.hash('secret123', 4), name: 'Owner', role: 'ADMIN' } });
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  ids.owner = (await call('POST', '/auth/login', { body: { email: 'owner@import.test', password: 'secret123' } })).body.token;
});

after(async () => {
  if (skip) return;
  await prisma.tenant.deleteMany({ where: { slug: { in: ['importtest', 'importother'] } } });
  await prisma.user.deleteMany({ where: { email: 'owner@import.test' } });
  server?.close();
  await prisma.$disconnect();
});

const rows = [
  { category: 'sandwiches ', name: ' shawarma', nameAr: 'شاورما', price: '0.850', available: 'yes' }, // matched, price changes
  { category: 'Drinks', categoryAr: 'مشروبات', name: 'Karak', nameAr: 'كرك', price: 0.3, calories: '', description: 'Spiced tea' },
  { category: 'Drinks', name: 'Lemon mint', nameAr: 'ليمون نعناع', price: '0.45', calories: 120, available: 'no' },
];

test('the preview says what would change, and changes nothing', { skip }, async () => {
  const { status, body } = await call('POST', '/menu/import/preview', { token: ids.owner, body: { rows } });
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual([body.create, body.update, body.unchanged, body.errors], [2, 1, 0, 0]);
  assert.deepEqual(body.newCategories, ['Drinks']);
  assert.deepEqual(body.rows[0].changes, ['price']);
  assert.equal(await prisma.menuItem.count({ where: { tenantId: ids.tenant } }), 1, 'nothing written');
});

test('bad rows are reported by their spreadsheet row number, and block the import entirely', { skip }, async () => {
  const bad = [...rows, { category: 'Drinks', name: '', price: 'abc' }, { category: 'Drinks', name: 'Karak', price: 0.3 }];
  const preview = (await call('POST', '/menu/import/preview', { token: ids.owner, body: { rows: bad } })).body;
  assert.equal(preview.errors, 2);
  assert.deepEqual(preview.rows.filter((r) => r.action === 'error').map((r) => r.row), [5, 6]);
  assert.match(preview.rows[4].error, /twice/);
  const refused = await call('POST', '/menu/import', { token: ids.owner, body: { rows: bad } });
  assert.equal(refused.status, 422);
  assert.equal(await prisma.menuItem.count({ where: { tenantId: ids.tenant } }), 1, 'all or nothing');
});

test('the import creates, updates and matches, never duplicates, and touches no other restaurant', { skip }, async () => {
  const done = await call('POST', '/menu/import', { token: ids.owner, body: { rows } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const items = await prisma.menuItem.findMany({ where: { tenantId: ids.tenant }, include: { category: true }, orderBy: { nameEn: 'asc' } });
  assert.deepEqual(
    items.map((i) => [i.category.nameEn, i.nameEn, Number(i.price), i.calories, i.isAvailable]),
    [
      ['Drinks', 'Karak', 0.3, null, true],
      ['Drinks', 'Lemon mint', 0.45, 120, false],
      ['Sandwiches', 'Shawarma', 0.85, null, true],
    ],
  );
  assert.equal(items.find((i) => i.nameEn === 'Shawarma').id, ids.shawarma, 'the existing item was updated, not copied');
  assert.equal(Number((await prisma.menuItem.findUnique({ where: { id: ids.otherShawarma } })).price), 0.5);
  // Running the same file again changes nothing.
  const again = (await call('POST', '/menu/import/preview', { token: ids.owner, body: { rows } })).body;
  assert.deepEqual([again.create, again.update, again.unchanged], [0, 0, 3]);
});
