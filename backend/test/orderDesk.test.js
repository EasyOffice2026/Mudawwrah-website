/**
 * The order desk's live behaviour, end to end over HTTP against a real PostgreSQL: the waiting count in the feed, the
 * live connection that tells a screen at once, and which branch screens are connected.
 * Needs TEST_DATABASE_URL pointing at a throwaway database (never production); skipped without it.
 *
 *   TEST_DATABASE_URL=postgresql://... node --test test/orderDesk.test.js
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB || /supabase|pooler|amazonaws/i.test(DB) ? 'needs TEST_DATABASE_URL (a throwaway database)' : false;

let server;
let base;
let prisma;
const ids = {};
const HEADERS = { 'content-type': 'application/json', 'x-tenant': 'desktest' };
const week = Array.from({ length: 7 }, (_, day) => ({ day, closed: false, breaks: [], open: '00:00', close: '00:00' }));

const call = async (method, path, { token, body, ip } = {}) => {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ip ? { 'cf-connecting-ip': ip } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: 'secret123' } })).body?.token;
const order = (area) => ({
  customerName: 'Sara',
  customerPhone: '96550001111',
  paymentMethod: 'KNET',
  orderType: 'DELIVERY',
  area,
  address: `${area}, block 1`,
  items: [{ menuItemId: ids.item, quantity: 1 }],
});

/** Opens the live connection and collects what it says. */
const listen = async (token) => {
  const controller = new AbortController();
  const heard = [];
  const res = await fetch(`${base}/api/orders/stream`, { headers: { ...HEADERS, authorization: `Bearer ${token}` }, signal: controller.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        for (const line of decoder.decode(value).split('\n')) if (line.startsWith('data: ')) heard.push(line.slice(6));
      }
    } catch {
      /* closed by the test */
    }
  })();
  return { status: res.status, type: res.headers.get('content-type'), heard, close: () => controller.abort() };
};
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.JWT_SECRET = 'test-secret';
  process.env.PAYMENT_PROVIDER = 'manual';
  ({ prisma } = await import('../src/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;

  await prisma.tenant.deleteMany({ where: { slug: 'desktest' } });
  await prisma.user.deleteMany({ where: { email: { in: ['owner@desk.test', 'jahra@desk.test', 'ardiya@desk.test'] } } });
  const tenant = await prisma.tenant.create({ data: { slug: 'desktest', nameEn: 'Desk Test', nameAr: 'اختبار' } });
  const t = tenant.id;
  ids.tenant = t;
  const password = await bcrypt.hash('secret123', 4);
  await prisma.user.create({ data: { tenantId: t, email: 'owner@desk.test', password, name: 'Owner', role: 'ADMIN' } });
  const branch = (nameEn, nameAr) => prisma.pickupLocation.create({ data: { tenantId: t, nameEn, nameAr, hours: week, prepMinutes: 20 } });
  ids.jahra = (await branch('Al Jahra', 'الجهراء')).id;
  ids.ardiya = (await branch('Al Ardiya', 'العارضية')).id;
  await prisma.user.create({ data: { tenantId: t, email: 'jahra@desk.test', password, name: 'Jahra desk', role: 'BRANCH', branchId: ids.jahra } });
  await prisma.user.create({ data: { tenantId: t, email: 'ardiya@desk.test', password, name: 'Ardiya desk', role: 'BRANCH', branchId: ids.ardiya } });
  const category = await prisma.category.create({ data: { tenantId: t, nameEn: 'Mains', nameAr: 'رئيسي', slug: 'mains' } });
  ids.item = (await prisma.menuItem.create({ data: { tenantId: t, nameEn: 'Shawarma', nameAr: 'شاورما', price: 1.5, categoryId: category.id } })).id;
  await prisma.deliveryZone.create({ data: { tenantId: t, nameEn: 'Jahra', nameAr: 'الجهراء', branchId: ids.jahra, deliveryFee: 0.5, minimumOrder: 1 } });
  await prisma.deliveryZone.create({ data: { tenantId: t, nameEn: 'Ardiya', nameAr: 'العارضية', branchId: ids.ardiya, deliveryFee: 0.5, minimumOrder: 1 } });

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  ids.owner = await login('owner@desk.test');
  ids.jahraDesk = await login('jahra@desk.test');
  ids.ardiyaDesk = await login('ardiya@desk.test');
});
after(async () => {
  server?.closeAllConnections?.();
  server?.close();
  await prisma?.$disconnect();
});

test('the feed counts orders waiting to be accepted, and since when', { skip }, async () => {
  const empty = await call('GET', '/orders/feed', { token: ids.owner });
  assert.deepEqual([empty.body.waiting.count, empty.body.waiting.oldestAt], [0, null]);

  const a = await call('POST', '/orders', { body: order('Jahra') });
  const b = await call('POST', '/orders', { body: order('Jahra') });
  const c = await call('POST', '/orders', { body: order('Ardiya') });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  ids.jahraOrder = a.body.id;
  // Make the first one clearly older than the rest.
  await prisma.order.update({ where: { id: a.body.id }, data: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } });

  const owner = await call('GET', '/orders/feed', { token: ids.owner });
  assert.equal(owner.body.waiting.count, 3);
  assert.ok(Date.now() - new Date(owner.body.waiting.oldestAt).getTime() >= 19 * 60 * 1000, 'oldest is the 20-minute-old one');
  const byBranch = Object.fromEntries(owner.body.waitingByBranch.map((r) => [r.nameEn, r.count]));
  assert.deepEqual(byBranch, { 'Al Jahra': 2, 'Al Ardiya': 1 });

  // A branch only ever sees its own, and no breakdown by branch.
  const jahra = await call('GET', '/orders/feed', { token: ids.jahraDesk });
  assert.equal(jahra.body.waiting.count, 2);
  assert.equal(jahra.body.waitingByBranch, undefined);
  assert.equal((await call('GET', '/orders/feed', { token: ids.ardiyaDesk })).body.waiting.count, 1);
  assert.ok(b.body.id && c.body.id);
});

test('accepting an order takes it off the waiting count; an old forgotten one does not ring for ever', { skip }, async () => {
  await call('PATCH', `/orders/${ids.jahraOrder}/status`, { token: ids.owner, body: { status: 'CONFIRMED' } });
  assert.equal((await call('GET', '/orders/feed', { token: ids.owner })).body.waiting.count, 2);
  const stale = await call('POST', '/orders', { body: order('Jahra') });
  await prisma.order.update({ where: { id: stale.body.id }, data: { createdAt: new Date(Date.now() - 30 * 3600 * 1000) } });
  assert.equal((await call('GET', '/orders/feed', { token: ids.owner })).body.waiting.count, 2, 'older than a day is not counted');
});

test('the live connection tells an owner screen at once when an order is placed', { skip }, async () => {
  const stream = await listen(ids.owner);
  assert.equal(stream.status, 200);
  assert.match(stream.type, /text\/event-stream/);
  assert.ok(await until(() => stream.heard.includes('hello')), 'connected');
  const placed = await call('POST', '/orders', { body: order('Ardiya') });
  assert.equal(placed.status, 201);
  assert.ok(await until(() => stream.heard.includes('orders')), 'told immediately, without waiting for the next check');
  stream.close();
});

test('a branch screen is told about its own branch and not about another', { skip }, async () => {
  const jahra = await listen(ids.jahraDesk);
  const ardiya = await listen(ids.ardiyaDesk);
  assert.ok(await until(() => jahra.heard.includes('hello') && ardiya.heard.includes('hello')));
  await call('POST', '/orders', { body: order('Ardiya') });
  assert.ok(await until(() => ardiya.heard.includes('orders')), 'Ardiya told');
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(jahra.heard.includes('orders'), false, 'Jahra not told about an Ardiya order');
  jahra.close();
  ardiya.close();
});

test('another desk moving an order is shown on the open screens at once', { skip }, async () => {
  const stream = await listen(ids.jahraDesk);
  assert.ok(await until(() => stream.heard.includes('hello')));
  const placed = await call('POST', '/orders', { body: order('Jahra') });
  assert.ok(await until(() => stream.heard.filter((h) => h === 'orders').length >= 1));
  const before = stream.heard.filter((h) => h === 'orders').length;
  await call('PATCH', `/orders/${placed.body.id}/status`, { token: ids.owner, body: { status: 'PREPARING' } });
  assert.ok(await until(() => stream.heard.filter((h) => h === 'orders').length > before), 'status change announced');
  stream.close();
});

test('the live connection is for the order desk only', { skip }, async () => {
  const res = await fetch(`${base}/api/orders/stream`, { headers: HEADERS });
  assert.equal(res.status, 401);
});

test('the owner sees which branch screens are connected and from where', { skip }, async () => {
  // Jahra's screen checked in (the feed calls above); Ardiya's did too. Make a fresh restaurant view of it:
  const first = await call('GET', '/branches/presence', { token: ids.owner });
  assert.equal(first.status, 200);
  const jahra = first.body.find((b) => b.nameEn === 'Al Jahra');
  assert.equal(jahra.online, true);
  assert.ok(jahra.lastSeenAt && jahra.address, JSON.stringify(jahra));
  // It records the address a branch really connects from (what the address lock compares against).
  await call('GET', '/orders/feed', { token: ids.jahraDesk, ip: '188.70.21.47' });
  const again = (await call('GET', '/branches/presence', { token: ids.owner })).body.find((b) => b.nameEn === 'Al Jahra');
  assert.equal(again.address, '188.70.21.47');
});

test('branch connection details are for the owner only', { skip }, async () => {
  assert.equal((await call('GET', '/branches/presence')).status, 401);
  assert.equal((await call('GET', '/branches/presence', { token: ids.jahraDesk })).status, 403);
});
