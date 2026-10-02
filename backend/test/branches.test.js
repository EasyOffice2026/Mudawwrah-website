/**
 * Branches, delivery zones, branch accounts and permissions, end to end over HTTP
 * against a real PostgreSQL. Needs TEST_DATABASE_URL pointing at a throwaway
 * database — never the production one: every run wipes the tables it uses.
 *
 *   TEST_DATABASE_URL=postgresql://... node --test test/
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const DB = process.env.TEST_DATABASE_URL;
if (!DB || /supabase|pooler|amazonaws/i.test(DB)) throw new Error('Set TEST_DATABASE_URL to a throwaway local database');
process.env.DATABASE_URL = DB;
process.env.DIRECT_URL = DB;
process.env.JWT_SECRET = 'test-secret';

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/prisma.js');
const { clearBranchAccessCache } = await import('../src/middleware/auth.js');
const { isOpenAt, nextOpening } = await import('../src/services/branchHours.js');
const bcrypt = (await import('bcryptjs')).default;

// Kuwait is UTC+3. 2026-10-02 is a Friday, 2026-10-01 a Thursday.
const kw = (iso) => new Date(`${iso}+03:00`);
const week = (row, overrides = {}) => Array.from({ length: 7 }, (_, day) => ({ day, closed: false, breaks: [], ...row, ...(overrides[day] || {}) }));
const fridayPrayer = { 5: { breaks: [{ from: '11:30', to: '13:00' }] } };
const ALWAYS = week({ open: '00:00', close: '00:00' }, fridayPrayer); // 24h, closes for Jumu'ah
const SABAH = week({ open: '04:00', close: '16:00' }, fridayPrayer);
const NEVER = week({ open: '09:00', close: '23:00', closed: true });
// Always open, with no break: the order tests must not depend on the day or time they run.
const OPEN_24 = week({ open: '00:00', close: '00:00' });

test('hours: 24h branches, Sabah Al-Ahmad 04:00–16:00 and the Friday prayer break, in Kuwait time', () => {
  assert.equal(isOpenAt(ALWAYS, kw('2026-10-01T03:00:00')), true, '24h on Thursday night');
  assert.equal(isOpenAt(ALWAYS, kw('2026-10-02T11:29:00')), true, 'Friday before prayer');
  assert.equal(isOpenAt(ALWAYS, kw('2026-10-02T11:30:00')), false, 'Friday prayer');
  assert.equal(isOpenAt(ALWAYS, kw('2026-10-02T12:59:00')), false, 'Friday prayer');
  assert.equal(isOpenAt(ALWAYS, kw('2026-10-02T13:00:00')), true, 'after prayer');
  assert.equal(isOpenAt(SABAH, kw('2026-10-01T03:59:00')), false);
  assert.equal(isOpenAt(SABAH, kw('2026-10-01T04:00:00')), true);
  assert.equal(isOpenAt(SABAH, kw('2026-10-01T15:59:00')), true);
  assert.equal(isOpenAt(SABAH, kw('2026-10-01T16:00:00')), false);
  assert.deepEqual(nextOpening(SABAH, kw('2026-10-01T17:10:00')), { time: '04:00', daysAhead: 1 });
  assert.deepEqual(nextOpening(ALWAYS, kw('2026-10-02T12:00:00')), { time: '13:00', daysAhead: 0 });
  const late = week({ open: '18:00', close: '02:00' }, { 4: { closed: true } });
  assert.equal(isOpenAt(late, kw('2026-10-01T01:00:00')), true, "Wednesday's 18:00–02:00 runs into Thursday");
  assert.equal(isOpenAt(late, kw('2026-10-01T19:00:00')), false, 'Thursday itself closed');
  assert.equal(isOpenAt(null, new Date()), true, 'no hours means open');
});

let server;
let base;
const ids = {};
const HEADERS = { 'content-type': 'application/json', 'x-tenant': 'branchtest' };
const call = async (method, path, { token, body, ip } = {}) => {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { 'cf-connecting-ip': ip } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const login = async (email, ip) => (await call('POST', '/auth/login', { body: { email, password: 'secret123' }, ip })).body?.token;
const order = (extra) => ({
  customerName: 'Sara',
  customerPhone: '96550001111',
  paymentMethod: 'CASH',
  items: [{ menuItemId: ids.shawarma, quantity: 2 }],
  ...extra,
});

before(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "Tenant", "User" CASCADE');
  const tenant = await prisma.tenant.create({ data: { slug: 'branchtest', nameEn: 'Branch Test', nameAr: 'اختبار' } });
  const t = tenant.id;
  const password = await bcrypt.hash('secret123', 4);
  await prisma.user.create({ data: { tenantId: t, email: 'owner@test.kw', password, name: 'Owner', role: 'ADMIN' } });
  const branch = (nameEn, hours, allowedIps = []) => prisma.pickupLocation.create({ data: { tenantId: t, nameEn, hours, allowedIps, prepMinutes: 20 } });
  ids.jahra = (await branch('Al Jahra', OPEN_24, ['10.0.0.1'])).id;
  ids.ardiya = (await branch('Al Ardiya', OPEN_24)).id;
  ids.closed = (await branch('Closed Branch', NEVER)).id;
  const category = await prisma.category.create({ data: { tenantId: t, nameEn: 'Mains', nameAr: 'رئيسي', slug: 'mains' } });
  ids.shawarma = (await prisma.menuItem.create({ data: { tenantId: t, nameEn: 'Shawarma', price: 1.5, categoryId: category.id } })).id;
  ids.cola = (await prisma.menuItem.create({ data: { tenantId: t, nameEn: 'Cola', price: 0.5, categoryId: category.id } })).id;
  const zone = (nameEn, nameAr, branchId, extra = {}) => prisma.deliveryZone.create({ data: { tenantId: t, nameEn, nameAr, branchId, ...extra } });
  ids.zJahra = (await zone('Jahra', 'الجهراء', ids.jahra, { deliveryFee: 0.5, minimumOrder: 2 })).id;
  ids.zArdiya = (await zone('Ardiya', 'العارضية', ids.ardiya, { deliveryFee: 0.75, minimumOrder: 4, etaMinutes: 40 })).id;
  ids.zClosed = (await zone('Qasr', 'القصر', ids.closed)).id;

  // A second restaurant whose branch must stay invisible to the first.
  const other = await prisma.tenant.create({ data: { slug: 'othertest', nameEn: 'Other', nameAr: 'آخر' } });
  ids.foreignBranch = (await prisma.pickupLocation.create({ data: { tenantId: other.id, nameEn: 'Foreign' } })).id;

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  ids.owner = await login('owner@test.kw');
});
after(async () => {
  server?.close();
  await prisma.$disconnect();
});

test('delivery: the area picks the zone and branch, with the zone fee and minimum; typed names match loosely', async () => {
  const a = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'al-jahra', block: '3', street: '10', building: '5', address: 'Jahra, Block 3' }) });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.branchId, ids.jahra);
  assert.equal(a.body.zoneId, ids.zJahra);
  assert.equal(Number(a.body.deliveryFee), 0.5);
  assert.equal(a.body.area, 'Jahra');
  assert.equal(a.body.block, '3', 'address parts are kept now');
  assert.equal(a.body.branch.nameEn, 'Al Jahra');

  const b = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'الجهراء' }) });
  assert.equal(b.body.zoneId, ids.zJahra, 'Arabic name matches too');

  const c = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', zoneId: ids.zArdiya, items: [{ menuItemId: ids.shawarma, quantity: 3 }] }) });
  assert.equal(c.status, 201);
  assert.equal(Number(c.body.deliveryFee), 0.75);
  ids.ardiyaOrder = c.body.id;
  ids.jahraOrder = a.body.id;
});

test('delivery is refused for an uncovered area, a closed branch, or below the zone minimum', async () => {
  const uncovered = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Salmiya' }) });
  assert.equal(uncovered.status, 422);
  assert.match(uncovered.body.error || uncovered.body.message, /do not deliver to Salmiya/);

  const closed = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Qasr' }) });
  assert.equal(closed.status, 409);
  assert.match(closed.body.error || closed.body.message, /Closed Branch branch, which delivers to Qasr, is closed/);

  const below = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', zoneId: ids.zArdiya }) });
  assert.equal(below.status, 422, 'Ardiya minimum is 4.000; 2 shawarma are 3.000');
  assert.match(below.body.error || below.body.message, /4\.000/);
});

test('pickup needs a branch when branches exist, and a closed branch cannot take it', async () => {
  assert.equal((await call('POST', '/orders', { body: order({ orderType: 'PICKUP' }) })).status, 422);
  assert.equal((await call('POST', '/orders', { body: order({ orderType: 'PICKUP', pickupLocationId: ids.closed }) })).status, 409);
  const ok = await call('POST', '/orders', { body: order({ orderType: 'PICKUP', pickupLocationId: ids.ardiya }) });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.branchId, ids.ardiya);
  assert.equal(ok.body.zoneId, null);
});

test('the owner creates branch accounts; a branch account needs one of this restaurant\'s own branches', async () => {
  const noBranch = await call('POST', '/users', { token: ids.owner, body: { email: 'x@test.kw', password: 'secret123', name: 'X', role: 'BRANCH' } });
  assert.equal(noBranch.status, 400);
  const foreign = await call('POST', '/users', { token: ids.owner, body: { email: 'x@test.kw', password: 'secret123', name: 'X', role: 'BRANCH', branchId: ids.foreignBranch } });
  assert.equal(foreign.status, 400);
  const jahra = await call('POST', '/users', { token: ids.owner, body: { email: 'jahra@test.kw', password: 'secret123', name: 'Jahra desk', role: 'BRANCH', branchId: ids.jahra } });
  assert.equal(jahra.status, 201, JSON.stringify(jahra.body));
  assert.equal(jahra.body.branch.nameEn, 'Al Jahra');
  const ardiya = await call('POST', '/users', { token: ids.owner, body: { email: 'ardiya@test.kw', password: 'secret123', name: 'Ardiya desk', role: 'BRANCH', branchId: ids.ardiya } });
  assert.equal(ardiya.status, 201);
});

test('a branch account signs in only from its branch\'s static IP, and is re-checked on every request', async () => {
  clearBranchAccessCache();
  const away = await call('POST', '/auth/login', { body: { email: 'jahra@test.kw', password: 'secret123' }, ip: '203.0.113.9' });
  assert.equal(away.status, 403);
  assert.match(away.body.error || away.body.message, /only be used from the branch/);

  ids.jahraDesk = await login('jahra@test.kw', '10.0.0.1');
  assert.ok(ids.jahraDesk, 'login from the branch IP works');
  assert.equal((await call('GET', '/orders', { token: ids.jahraDesk, ip: '10.0.0.1' })).status, 200);
  assert.equal((await call('GET', '/orders', { token: ids.jahraDesk, ip: '203.0.113.9' })).status, 403, 'same token, other network');

  ids.ardiyaDesk = await login('ardiya@test.kw', '198.51.100.7');
  assert.ok(ids.ardiyaDesk, 'a branch without listed IPs is not restricted');
});

test('branch accounts see and update only their own branch\'s orders, including the new statuses', async () => {
  const mine = await call('GET', '/orders', { token: ids.jahraDesk, ip: '10.0.0.1' });
  assert.ok(mine.body.data.length >= 2);
  assert.ok(mine.body.data.every((o) => o.branchId === ids.jahra));
  const widened = await call('GET', `/orders?branchId=${ids.ardiya}`, { token: ids.jahraDesk, ip: '10.0.0.1' });
  assert.ok(widened.body.data.every((o) => o.branchId === ids.jahra), 'cannot ask for another branch');

  assert.equal((await call('GET', `/orders/${ids.ardiyaOrder}`, { token: ids.jahraDesk, ip: '10.0.0.1' })).status, 404);
  assert.equal((await call('PATCH', `/orders/${ids.ardiyaOrder}/status`, { token: ids.jahraDesk, ip: '10.0.0.1', body: { status: 'PREPARING' } })).status, 404);

  for (const status of ['PREPARING', 'OUT_FOR_DELIVERY', 'REACHED', 'DELIVERED']) {
    const res = await call('PATCH', `/orders/${ids.jahraOrder}/status`, { token: ids.jahraDesk, ip: '10.0.0.1', body: { status } });
    assert.equal(res.status, 200, `${status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.status, status);
  }

  const owner = await call('GET', '/orders', { token: ids.owner });
  assert.ok(owner.body.data.some((o) => o.branchId === ids.ardiya) && owner.body.data.some((o) => o.branchId === ids.jahra), 'the owner sees every branch');
  const filtered = await call('GET', `/orders?branchId=${ids.ardiya}`, { token: ids.owner });
  assert.ok(filtered.body.data.length && filtered.body.data.every((o) => o.branchId === ids.ardiya), 'the owner can filter by branch');
});

test('branch accounts cannot touch discounts, settings, fees, users, branches, zones or the sales dashboard', async () => {
  const t = { token: ids.jahraDesk, ip: '10.0.0.1' };
  const blocked = [
    ['GET', '/dashboard/stats'],
    ['POST', '/promotions', { code: 'X', type: 'PERCENT', value: 10 }],
    ['PUT', '/settings', { deliveryFee: '0' }],
    ['GET', '/users'],
    ['POST', '/zones', { nameEn: 'Z', branchId: ids.jahra }],
    ['PUT', `/pickup-locations/${ids.jahra}`, { allowedIps: [] }],
    ['PUT', `/items/${ids.cola}`, { price: 0.1 }],
  ];
  for (const [method, path, body] of blocked) {
    assert.equal((await call(method, path, { ...t, body })).status, 403, `${method} ${path}`);
  }
});

test('a branch marks an item sold out at its own branch only', async () => {
  const set = await call('PUT', '/branch-sold-out', { token: ids.jahraDesk, ip: '10.0.0.1', body: { menuItemId: ids.shawarma, soldOut: true, branchId: ids.ardiya } });
  assert.equal(set.status, 200);
  assert.equal(set.body.branchId, ids.jahra, 'a branch account cannot mark another branch');
  assert.deepEqual((await call('GET', '/branch-sold-out', { token: ids.jahraDesk, ip: '10.0.0.1' })).body.menuItemIds, [ids.shawarma]);

  const jahra = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Jahra' }) });
  assert.equal(jahra.status, 409);
  assert.match(jahra.body.error || jahra.body.message, /Shawarma is sold out at our Al Jahra branch/);
  const ardiya = await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Ardiya', items: [{ menuItemId: ids.shawarma, quantity: 3 }] }) });
  assert.equal(ardiya.status, 201, 'still on sale at Al Ardiya');

  await call('PUT', '/branch-sold-out', { token: ids.jahraDesk, ip: '10.0.0.1', body: { menuItemId: ids.shawarma, soldOut: false } });
  assert.equal((await call('POST', '/orders', { body: order({ orderType: 'DELIVERY', area: 'Jahra' }) })).status, 201, 'back on sale');
});

test('public lists: branches with open status and no IPs; zones with their branch\'s status', async () => {
  const branches = (await call('GET', '/pickup-locations')).body;
  const jahra = branches.find((b) => b.id === ids.jahra);
  assert.equal(jahra.openNow, true);
  assert.equal(jahra.allowedIps, undefined, 'static IPs never reach the public');
  const closed = branches.find((b) => b.id === ids.closed);
  assert.equal(closed.openNow, false);

  const zones = (await call('GET', '/zones')).body;
  assert.deepEqual(zones.map((z) => z.nameEn).sort(), ['Ardiya', 'Jahra', 'Qasr']);
  const ardiya = zones.find((z) => z.nameEn === 'Ardiya');
  assert.equal(ardiya.deliveryFee, 0.75);
  assert.equal(ardiya.etaMinutes, 40);
  assert.equal(ardiya.branch.openNow, true);
  assert.equal(ardiya.branch.allowedIps, undefined);
});

test('the owner manages zones and branch IPs/hours; zones cannot point at another restaurant\'s branch', async () => {
  const created = await call('POST', '/zones', { token: ids.owner, body: { nameEn: 'Saad Al Abdullah', nameAr: 'سعد العبدالله', branchId: ids.jahra, deliveryFee: 0.5 } });
  assert.equal(created.status, 201);
  assert.equal((await call('POST', '/zones', { token: ids.owner, body: { nameEn: 'Bad', branchId: ids.foreignBranch } })).status, 400);
  assert.equal((await call('DELETE', `/zones/${created.body.id}`, { token: ids.owner })).status, 204);

  const updated = await call('PUT', `/pickup-locations/${ids.ardiya}`, { token: ids.owner, body: { allowedIps: [' 37.39.10.20 ', '37.39.10.20'], hours: SABAH } });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.deepEqual(updated.body.allowedIps, ['37.39.10.20']);
  assert.deepEqual(updated.body.hours[5].breaks, [{ from: '11:30', to: '13:00' }]);
});
