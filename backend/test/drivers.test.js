/**
 * Delivery drivers and live tracking, end to end over HTTP against a real PostgreSQL.
 * Needs TEST_DATABASE_URL pointing at a throwaway database (never production); without it every test here
 * is skipped. Run with:
 *
 *   TEST_DATABASE_URL=postgresql://... node --test test/drivers.test.js
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB || /supabase|pooler|amazonaws/i.test(DB) ? 'needs TEST_DATABASE_URL (a throwaway database)' : false;

const HEADERS = { 'content-type': 'application/json', 'x-tenant': 'drivertest' };
const ids = {};
let prisma;
let server;
let base;

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { ...HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
};
const order = (extra) => ({
  customerName: 'Sara',
  customerPhone: '96550001111',
  paymentMethod: 'KNET',
  orderType: 'DELIVERY',
  area: 'Jahra',
  block: '3',
  street: '10',
  building: '5',
  address: 'Jahra, Block 3',
  deliveryLat: 29.3375,
  deliveryLng: 47.6581,
  items: [{ menuItemId: ids.shawarma, quantity: 2 }],
  ...extra,
});
const week = Array.from({ length: 7 }, (_, day) => ({ day, closed: false, breaks: [], open: '00:00', close: '00:00' }));
const driverLogin = async (phone, password = 'driver123') => call('POST', '/driver/login', { body: { phone, password } });

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.JWT_SECRET = 'test-secret';
  ({ prisma } = await import('../src/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;

  await prisma.tenant.deleteMany({ where: { slug: 'drivertest' } });
  const tenant = await prisma.tenant.create({ data: { slug: 'drivertest', nameEn: 'Driver Test', nameAr: 'اختبار' } });
  const t = tenant.id;
  const password = await bcrypt.hash('secret123', 4);
  await prisma.user.deleteMany({ where: { email: { in: ['owner@driver.test', 'jahra@driver.test', 'ardiya@driver.test'] } } });
  await prisma.user.create({ data: { tenantId: t, email: 'owner@driver.test', password, name: 'Owner', role: 'ADMIN' } });
  const branch = (nameEn) => prisma.pickupLocation.create({ data: { tenantId: t, nameEn, hours: week, prepMinutes: 20 } });
  ids.jahra = (await branch('Al Jahra')).id;
  ids.ardiya = (await branch('Al Ardiya')).id;
  await prisma.user.create({ data: { tenantId: t, email: 'jahra@driver.test', password, name: 'Jahra desk', role: 'BRANCH', branchId: ids.jahra } });
  await prisma.user.create({ data: { tenantId: t, email: 'ardiya@driver.test', password, name: 'Ardiya desk', role: 'BRANCH', branchId: ids.ardiya } });
  const category = await prisma.category.create({ data: { tenantId: t, nameEn: 'Mains', nameAr: 'رئيسي', slug: 'mains' } });
  ids.shawarma = (await prisma.menuItem.create({ data: { tenantId: t, nameEn: 'Shawarma', nameAr: 'شاورما', price: 1.5, categoryId: category.id } })).id;
  await prisma.deliveryZone.create({ data: { tenantId: t, nameEn: 'Jahra', nameAr: 'الجهراء', branchId: ids.jahra, deliveryFee: 0.5, minimumOrder: 1 } });
  await prisma.deliveryZone.create({ data: { tenantId: t, nameEn: 'Ardiya', nameAr: 'العارضية', branchId: ids.ardiya, deliveryFee: 0.5, minimumOrder: 1 } });

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: 'secret123' } })).body.token;
  ids.owner = await login('owner@driver.test');
  ids.jahraDesk = await login('jahra@driver.test');
  ids.ardiyaDesk = await login('ardiya@driver.test');
});
after(async () => {
  server?.close();
  await prisma?.$disconnect();
});

test('the owner makes a driver with a name, a phone number and a password: no email is asked', { skip }, async () => {
  const ahmed = await call('POST', '/users', { token: ids.owner, body: { name: 'Ahmed Ali', phone: '+965 5000 2222', password: 'driver123', role: 'DRIVER' } });
  assert.equal(ahmed.status, 201, JSON.stringify(ahmed.body));
  assert.equal(ahmed.body.role, 'DRIVER');
  assert.equal(ahmed.body.branchId, null, 'no branch: delivers for every branch');
  ids.ahmed = ahmed.body.id;
  const omar = await call('POST', '/users', { token: ids.owner, body: { name: 'Omar', phone: '50003333', password: 'driver123', role: 'DRIVER', branchId: ids.ardiya } });
  assert.equal(omar.status, 201, JSON.stringify(omar.body));
  assert.equal(omar.body.branchId, ids.ardiya);
  ids.omar = omar.body.id;

  // The phone number is the sign-in, so it is required and one driver's alone.
  assert.equal((await call('POST', '/users', { token: ids.owner, body: { name: 'No phone', password: 'driver123', role: 'DRIVER' } })).status, 400);
  assert.equal((await call('POST', '/users', { token: ids.owner, body: { name: 'Same', phone: '0096550002222', password: 'driver123', role: 'DRIVER' } })).status, 409);
  // Everyone else still needs an email.
  assert.equal((await call('POST', '/users', { token: ids.owner, body: { name: 'Staff', password: 'secret123', role: 'STAFF' } })).status, 400);
});

test('a driver signs in with the phone number, however it is typed; a wrong number and a wrong password look the same', { skip }, async () => {
  const good = await driverLogin('5000 2222');
  assert.equal(good.status, 200, JSON.stringify(good.body));
  assert.equal(good.body.user.role, 'DRIVER');
  assert.ok(good.body.token && good.body.refreshToken);
  ids.ahmedToken = good.body.token;
  ids.omarToken = (await driverLogin('+96550003333')).body.token;
  const wrongPassword = await driverLogin('50002222', 'nope');
  const wrongNumber = await driverLogin('59999999');
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongNumber.status, 401);
  assert.equal(wrongPassword.body.error, wrongNumber.body.error);
  // A renewal hands a driver a new 30-day token as well, so a phone in daily use is never signed out mid-shift.
  const renewed = await call('POST', '/auth/refresh', { body: { refreshToken: good.body.refreshToken } });
  assert.equal(renewed.status, 200);
  assert.ok(renewed.body.refreshToken, 'a driver gets a new renewal token');
});

test('a driver account opens the driver page only: nothing of the order desk or the admin', { skip }, async () => {
  for (const path of ['/orders', '/orders/feed', '/users', '/drivers', '/dashboard/stats', '/print/stations']) {
    assert.equal((await call('GET', path, { token: ids.ahmedToken })).status, 403, path);
  }
  // And the order desk cannot use the driver's endpoints.
  assert.equal((await call('GET', '/driver/orders', { token: ids.owner })).status, 403);
  assert.equal((await call('GET', '/driver/orders')).status, 401);
});

test('the order desk gives a delivery to a driver; a branch sees its own drivers and the shared ones', { skip }, async () => {
  const placed = await call('POST', '/orders', { body: order() });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  ids.order = placed.body.id;

  const forOwner = await call('GET', '/drivers', { token: ids.owner });
  assert.deepEqual(forOwner.body.map((d) => d.name), ['Ahmed Ali', 'Omar']);
  const forJahra = await call('GET', '/drivers', { token: ids.jahraDesk });
  assert.deepEqual(forJahra.body.map((d) => d.name), ['Ahmed Ali'], "Omar is Ardiya's driver");

  // Jahra's desk cannot hand its order to Ardiya's driver, nor touch an order of another branch.
  assert.equal((await call('PATCH', `/orders/${ids.order}/driver`, { token: ids.jahraDesk, body: { driverId: ids.omar } })).status, 400);
  assert.equal((await call('PATCH', `/orders/${ids.order}/driver`, { token: ids.ardiyaDesk, body: { driverId: ids.omar } })).status, 404);
  assert.equal((await call('PATCH', `/orders/${ids.order}/driver`, { token: ids.jahraDesk, body: { driverId: ids.owner } })).status, 400);

  const given = await call('PATCH', `/orders/${ids.order}/driver`, { token: ids.jahraDesk, body: { driverId: ids.ahmed } });
  assert.equal(given.status, 200, JSON.stringify(given.body));
  assert.equal(given.body.driver.name, 'Ahmed Ali');
  assert.ok(given.body.driverAssignedAt);
  assert.equal((await call('GET', '/drivers', { token: ids.owner })).body.find((d) => d.id === ids.ahmed).activeOrders, 1);

  // A pickup order has no driver.
  const pickup = await call('POST', '/orders', { body: order({ orderType: 'PICKUP', pickupLocationId: ids.jahra, deliveryLat: undefined, deliveryLng: undefined }) });
  assert.equal(pickup.status, 201, JSON.stringify(pickup.body));
  assert.equal((await call('PATCH', `/orders/${pickup.body.id}/driver`, { token: ids.owner, body: { driverId: ids.ahmed } })).status, 409);
});

test('a driver sees only their own orders, with the address, the phone and what to collect', { skip }, async () => {
  const mine = await call('GET', '/driver/orders', { token: ids.ahmedToken });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.orders.length, 1);
  const [job] = mine.body.orders;
  assert.equal(job.id, ids.order);
  assert.equal(job.customerPhone, '50001111');
  assert.equal(job.block, '3');
  assert.equal(job.deliveryLat, 29.3375);
  assert.equal(job.paymentStatus, 'UNPAID');
  assert.equal(job.total, 3.5);
  assert.equal(mine.body.tracking, false);
  assert.match(mine.headers.get('cache-control') || '', /no-store/);
  assert.deepEqual((await call('GET', '/driver/orders', { token: ids.omarToken })).body.orders, []);
  // Another driver cannot start or finish it.
  assert.equal((await call('POST', `/driver/orders/${ids.order}/start`, { token: ids.omarToken })).status, 404);
  assert.equal((await call('POST', `/driver/orders/${ids.order}/delivered`, { token: ids.omarToken })).status, 404);
});

test('before the delivery starts nothing is followed: the position is dropped and the customer sees no driver', { skip }, async () => {
  const sent = await call('POST', '/driver/location', { token: ids.ahmedToken, body: { lat: 29.34, lng: 47.7 } });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.tracking, false, 'the phone is told to stop sending');
  const tracked = await call('GET', `/orders/track/${ids.order}`);
  assert.equal(tracked.status, 200);
  assert.equal(tracked.body.delivery, null);
  assert.equal((await call('GET', '/drivers', { token: ids.owner })).body.find((d) => d.id === ids.ahmed).location, null);
});

test('"Start delivery" puts the order on its way, and the customer then sees the driver, the map points and the time left', { skip }, async () => {
  const started = await call('POST', `/driver/orders/${ids.order}/start`, { token: ids.ahmedToken });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.orders[0].status, 'OUT_FOR_DELIVERY');
  assert.equal(started.body.tracking, true);
  const row = await prisma.order.findUnique({ where: { id: ids.order } });
  assert.ok(row.outForDeliveryAt, 'when it left is recorded for the reports');

  // On its way but the phone has not reported yet: the driver's name, no position.
  let tracked = (await call('GET', `/orders/track/${ids.order}`)).body;
  assert.equal(tracked.status, 'OUT_FOR_DELIVERY');
  assert.equal(tracked.delivery.driverName, 'Ahmed', 'first name only');
  assert.equal(tracked.delivery.location, null);
  assert.deepEqual(tracked.delivery.destination, { lat: 29.3375, lng: 47.6581 });

  assert.equal((await call('POST', '/driver/location', { token: ids.ahmedToken, body: { lat: 'x' } })).status, 400);
  const sent = await call('POST', '/driver/location', { token: ids.ahmedToken, body: { lat: 29.3759, lng: 47.9774, heading: 270, accuracy: 9 } });
  assert.equal(sent.body.tracking, true);
  tracked = (await call('GET', `/orders/track/${ids.order}`)).body;
  assert.equal(tracked.delivery.location.lat, 29.3759);
  assert.equal(tracked.delivery.location.heading, 270);
  assert.ok(tracked.delivery.etaMinutes > 30 && tracked.delivery.etaMinutes < 120, String(tracked.delivery.etaMinutes));
  // Nothing private rides along on the public link.
  const text = JSON.stringify(tracked);
  for (const secret of [ids.ahmed, '50002222', '50001111', 'Jahra, Block 3', 'Ali']) assert.ok(!text.includes(secret), secret);
  // The order desk sees where the driver is too.
  const desk = (await call('GET', '/drivers', { token: ids.jahraDesk })).body.find((d) => d.id === ids.ahmed);
  assert.equal(desk.location.lat, 29.3759);
  assert.equal(desk.location.fresh, true);
});

test('taking the delivery off a driver stops the tracking at once', { skip }, async () => {
  const taken = await call('PATCH', `/orders/${ids.order}/driver`, { token: ids.owner, body: { driverId: null } });
  assert.equal(taken.status, 200);
  assert.equal(taken.body.driver, null);
  assert.equal((await call('GET', `/orders/track/${ids.order}`)).body.delivery, null);
  assert.equal((await call('POST', '/driver/location', { token: ids.ahmedToken, body: { lat: 29.37, lng: 47.97 } })).body.tracking, false);
  assert.deepEqual((await call('GET', '/driver/orders', { token: ids.ahmedToken })).body.orders, []);
  // Given back, it is followed again.
  await call('PATCH', `/orders/${ids.order}/driver`, { token: ids.owner, body: { driverId: ids.ahmed } });
  assert.equal((await call('POST', '/driver/location', { token: ids.ahmedToken, body: { lat: 29.34, lng: 47.66 } })).body.tracking, true);
  assert.ok((await call('GET', `/orders/track/${ids.order}`)).body.delivery.location);
});

test('"Delivered" finishes the order and forgets where the driver is', { skip }, async () => {
  const done = await call('POST', `/driver/orders/${ids.order}/delivered`, { token: ids.ahmedToken });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.deepEqual(done.body.orders, []);
  assert.equal(done.body.deliveredToday, 1);
  assert.equal(done.body.tracking, false);
  const row = await prisma.order.findUnique({ where: { id: ids.order } });
  assert.equal(row.status, 'DELIVERED');
  assert.ok(row.deliveredAt);
  const tracked = (await call('GET', `/orders/track/${ids.order}`)).body;
  assert.equal(tracked.status, 'DELIVERED');
  assert.equal(tracked.delivery, null);
  assert.equal((await call('GET', '/drivers', { token: ids.owner })).body.find((d) => d.id === ids.ahmed).location, null);
  assert.equal((await call('POST', '/driver/location', { token: ids.ahmedToken, body: { lat: 29.34, lng: 47.66 } })).body.tracking, false);
  // The order desk still sees who delivered it.
  assert.equal((await call('GET', `/orders/${ids.order}`, { token: ids.owner })).body.driver.name, 'Ahmed Ali');
});

test('a driver switched off by the owner is signed out and can no longer be given orders', { skip }, async () => {
  const off = await call('PUT', `/users/${ids.omar}`, { token: ids.owner, body: { isActive: false } });
  assert.equal(off.status, 200, JSON.stringify(off.body));
  assert.equal((await call('GET', '/driver/orders', { token: ids.omarToken })).status, 401);
  assert.equal((await driverLogin('50003333')).status, 403);
  assert.deepEqual((await call('GET', '/drivers', { token: ids.owner })).body.map((d) => d.name), ['Ahmed Ali']);
  // Removing a driver's account keeps the orders they delivered.
  assert.equal((await call('DELETE', `/users/${ids.ahmed}`, { token: ids.owner })).status, 204);
  const kept = await call('GET', `/orders/${ids.order}`, { token: ids.owner });
  assert.equal(kept.status, 200);
  assert.equal(kept.body.driver, null);
});
