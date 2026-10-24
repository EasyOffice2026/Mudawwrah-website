/**
 * Automatic printing, end to end over HTTP against a real PostgreSQL.
 * Needs TEST_DATABASE_URL pointing at a throwaway database (never production); without it every test here
 * is skipped. Every run deletes the data of its own test restaurant.
 *
 *   TEST_DATABASE_URL=postgresql://... node --test test/printing.test.js
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB || /supabase|pooler|amazonaws/i.test(DB) ? 'needs TEST_DATABASE_URL (a throwaway database)' : false;

let server;
let base;
let prisma;
const ids = {};
const HEADERS = { 'content-type': 'application/json', 'x-tenant': 'printtest' };

const call = async (method, path, { token, body, key, query = '' } = {}) => {
  const res = await fetch(`${base}/api${path}${query}`, {
    method,
    headers: { ...HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(key ? { 'x-print-key': key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const jobsFor = (branch, key) => call('GET', '/print/jobs', { key, query: `?branch=${branch}` });
const order = (extra) => ({
  customerName: 'Sara',
  customerPhone: '96550001111',
  paymentMethod: 'KNET',
  items: [{ menuItemId: ids.shawarma, quantity: 2 }],
  ...extra,
});
const week = Array.from({ length: 7 }, (_, day) => ({ day, closed: false, breaks: [], open: '00:00', close: '00:00' }));

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.JWT_SECRET = 'test-secret';
  // The mock gateway is "on" for this restaurant only, so one test can pay an order online.
  process.env.PAYMENT_PROVIDER = 'mock';
  process.env.ONLINE_PAYMENT_TENANTS = 'printtest';
  // Only this phone is sent to the gateway, so every other test order is an ordinary one.
  process.env.ONLINE_PAYMENT_PILOT_PHONES = '55559999';
  process.env.PUBLIC_URL = 'http://localhost';
  ({ prisma } = await import('../src/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;

  await prisma.tenant.deleteMany({ where: { slug: 'printtest' } });
  const tenant = await prisma.tenant.create({ data: { slug: 'printtest', nameEn: 'Print Test', nameAr: 'اختبار' } });
  const t = tenant.id;
  const password = await bcrypt.hash('secret123', 4);
  await prisma.user.deleteMany({ where: { email: { in: ['owner@print.test', 'jahra@print.test'] } } });
  await prisma.user.create({ data: { tenantId: t, email: 'owner@print.test', password, name: 'Owner', role: 'ADMIN' } });
  const branch = (nameEn) => prisma.pickupLocation.create({ data: { tenantId: t, nameEn, hours: week, prepMinutes: 20 } });
  ids.jahra = (await branch('Al Jahra')).id;
  ids.ardiya = (await branch('Al Ardiya')).id;
  await prisma.user.create({ data: { tenantId: t, email: 'jahra@print.test', password, name: 'Jahra desk', role: 'BRANCH', branchId: ids.jahra } });
  const category = await prisma.category.create({ data: { tenantId: t, nameEn: 'Mains', nameAr: 'رئيسي', slug: 'mains' } });
  ids.shawarma = (await prisma.menuItem.create({ data: { tenantId: t, nameEn: 'Shawarma', nameAr: 'شاورما', price: 1.5, categoryId: category.id } })).id;
  ids.zJahra = (await prisma.deliveryZone.create({ data: { tenantId: t, nameEn: 'Jahra', nameAr: 'الجهراء', branchId: ids.jahra, deliveryFee: 0.5, minimumOrder: 1 } })).id;
  ids.zArdiya = (await prisma.deliveryZone.create({ data: { tenantId: t, nameEn: 'Ardiya', nameAr: 'العارضية', branchId: ids.ardiya, deliveryFee: 0.75, minimumOrder: 1 } })).id;

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await call('POST', '/auth/login', { body: { email: 'owner@print.test', password: 'secret123' } });
  ids.owner = login.body.token;
  const jahraLogin = await call('POST', '/auth/login', { body: { email: 'jahra@print.test', password: 'secret123' } });
  ids.jahraDesk = jahraLogin.body.token;
  const stations = await call('GET', '/print/stations', { token: ids.owner });
  ids.keys = Object.fromEntries((stations.body || []).map((s) => [s.id, s.key]));
});
after(async () => {
  server?.close();
  await prisma?.$disconnect();
});

test('the owner sees every branch station with its own private key', { skip }, async () => {
  assert.ok(ids.keys[ids.jahra] && ids.keys[ids.ardiya] && ids.keys.unassigned, JSON.stringify(ids.keys));
  assert.notEqual(ids.keys[ids.jahra], ids.keys[ids.ardiya]);
  assert.equal((await call('GET', '/print/stations')).status, 401, 'not for the public');
  assert.equal((await call('GET', '/print/stations', { token: ids.jahraDesk })).status, 403, 'not for a branch desk');
});

test('a placed order is waiting at its own branch\'s printer, and only there', { skip }, async () => {
  const placed = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Ardiya', block: '3', street: '10', building: '5', address: 'Ardiya, Block 3' }) });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  assert.equal(placed.body.branchId, ids.ardiya);
  ids.first = placed.body.id;

  const ardiya = await jobsFor(ids.ardiya, ids.keys[ids.ardiya]);
  assert.equal(ardiya.status, 200);
  assert.deepEqual(ardiya.body.jobs.map((j) => j.id), [ids.first]);
  const job = ardiya.body.jobs[0];
  // Everything the ticket shows is in the job.
  assert.equal(job.orderNumber, placed.body.orderNumber);
  assert.equal(job.items.length, 1);
  assert.equal(job.items[0].nameEn, 'Shawarma');
  assert.equal(job.branch.nameEn, 'Al Ardiya');
  assert.equal(job.zone.nameEn, 'Ardiya');
  assert.equal(job.customerName, 'Sara');

  const jahra = await jobsFor(ids.jahra, ids.keys[ids.jahra]);
  assert.deepEqual(jahra.body.jobs, []);
});

test('a printer link that is wrong, missing, or another branch\'s is refused', { skip }, async () => {
  assert.equal((await jobsFor(ids.ardiya, 'not-the-key')).status, 401);
  assert.equal((await jobsFor(ids.ardiya, undefined)).status, 401);
  assert.equal((await jobsFor(ids.ardiya, ids.keys[ids.jahra])).status, 401, "Jahra's key does not open Ardiya");
  assert.equal((await call('GET', '/print/jobs', { key: ids.keys[ids.ardiya] })).status, 401, 'no branch named');
  assert.equal((await call('POST', `/print/jobs/${ids.first}/printed`, { key: 'x', query: `?branch=${ids.ardiya}` })).status, 401);
});

test('a branch cannot report another branch\'s order printed', { skip }, async () => {
  const wrong = await call('POST', `/print/jobs/${ids.first}/printed`, { key: ids.keys[ids.jahra], query: `?branch=${ids.jahra}` });
  assert.equal(wrong.status, 404);
  const still = await jobsFor(ids.ardiya, ids.keys[ids.ardiya]);
  assert.equal(still.body.jobs.length, 1, 'still waiting');
});

test('once the station says it printed, the ticket stops coming back', { skip }, async () => {
  const done = await call('POST', `/print/jobs/${ids.first}/printed`, { key: ids.keys[ids.ardiya], query: `?branch=${ids.ardiya}` });
  assert.equal(done.status, 200);
  assert.equal(done.body.printCount, 1);
  assert.deepEqual((await jobsFor(ids.ardiya, ids.keys[ids.ardiya])).body.jobs, []);
});

test('tickets come out oldest first', { skip }, async () => {
  const a = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Ardiya', address: 'x' }) });
  const b = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Ardiya', address: 'y' }) });
  const jobs = (await jobsFor(ids.ardiya, ids.keys[ids.ardiya])).body.jobs;
  assert.deepEqual(jobs.map((j) => j.id), [a.body.id, b.body.id]);
  for (const j of jobs) await call('POST', `/print/jobs/${j.id}/printed`, { key: ids.keys[ids.ardiya], query: `?branch=${ids.ardiya}` });
});

test('a cancelled order is never printed', { skip }, async () => {
  const placed = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Ardiya', address: 'z' }) });
  await prisma.order.update({ where: { id: placed.body.id }, data: { status: 'CANCELLED' } });
  assert.deepEqual((await jobsFor(ids.ardiya, ids.keys[ids.ardiya])).body.jobs, []);
});

test('orders from before this existed are never printed', { skip }, async () => {
  const placed = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Ardiya', address: 'old' }) });
  await prisma.order.update({ where: { id: placed.body.id }, data: { printQueuedAt: null } });
  assert.deepEqual((await jobsFor(ids.ardiya, ids.keys[ids.ardiya])).body.jobs, []);
});

test('an order paid online prints when the payment is confirmed, not before', { skip }, async () => {
  const placed = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Ardiya', address: 'online', customerPhone: '96555559999' }) });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  assert.equal(placed.body.paymentStatus, 'PENDING');
  assert.ok(placed.body.paymentUrl, 'sent to the payment page');
  // Waiting for payment: nothing at the printer.
  assert.deepEqual((await jobsFor(ids.ardiya, ids.keys[ids.ardiya])).body.jobs, []);
  // The customer pays.
  const paid = await fetch(`${base}${new URL(placed.body.paymentUrl).pathname}${new URL(placed.body.paymentUrl).search}`);
  assert.equal(paid.status, 200);
  const jobs = (await jobsFor(ids.ardiya, ids.keys[ids.ardiya])).body.jobs;
  assert.deepEqual(jobs.map((j) => j.id), [placed.body.id]);
  assert.equal(jobs[0].paymentStatus, 'PAID');
  await call('POST', `/print/jobs/${placed.body.id}/printed`, { key: ids.keys[ids.ardiya], query: `?branch=${ids.ardiya}` });
});

test('the order desk can print a ticket again; a branch can only do its own', { skip }, async () => {
  const again = await call('POST', `/orders/${ids.first}/reprint`, { token: ids.owner });
  assert.equal(again.status, 200);
  assert.deepEqual((await jobsFor(ids.ardiya, ids.keys[ids.ardiya])).body.jobs.map((j) => j.id), [ids.first]);
  // Jahra's desk cannot touch an Ardiya order.
  assert.equal((await call('POST', `/orders/${ids.first}/reprint`, { token: ids.jahraDesk })).status, 404);
  assert.equal((await call('POST', `/orders/${ids.first}/reprint`)).status, 401);
  await call('POST', `/print/jobs/${ids.first}/printed`, { key: ids.keys[ids.ardiya], query: `?branch=${ids.ardiya}` });
});

test('the stations list counts what is waiting', { skip }, async () => {
  const placed = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Jahra', address: 'j' }) });
  const stations = await call('GET', '/print/stations', { token: ids.owner });
  const jahra = stations.body.find((s) => s.id === ids.jahra);
  assert.equal(jahra.waiting, 1);
  const ardiya = stations.body.find((s) => s.id === ids.ardiya);
  assert.equal(ardiya.waiting, 0);
  assert.ok(ardiya.lastPrinted?.orderNumber, 'remembers the last ticket it printed');
  await call('POST', `/print/jobs/${placed.body.id}/printed`, { key: ids.keys[ids.jahra], query: `?branch=${ids.jahra}` });
});
