/**
 * Ending sessions and approved branch devices, over HTTP against a real PostgreSQL.
 * Needs TEST_DATABASE_URL pointing at a throwaway database (never production); without it the tests are skipped.
 *
 *   TEST_DATABASE_URL=postgresql://... node --test test/sessionsDevices.test.js
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB || /supabase|pooler|amazonaws/i.test(DB) ? 'needs TEST_DATABASE_URL (a throwaway database)' : false;

let server;
let base;
let prisma;
const ids = {};
const week = Array.from({ length: 7 }, (_, day) => ({ day, closed: false, breaks: [], open: '00:00', close: '00:00' }));

const call = async (method, path, { token, body, device } = {}) => {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-tenant': 'sesstest',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(device ? { 'x-device-key': device } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const login = (email, device) => call('POST', '/auth/login', { body: { email, password: 'secret123' }, device });

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.JWT_SECRET = 'test-secret';
  ({ prisma } = await import('../src/prisma.js'));
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;

  const emails = ['owner@sess.test', 'staff@sess.test', 'jahra@sess.test', 'ardiya@sess.test'];
  await prisma.tenant.deleteMany({ where: { slug: 'sesstest' } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  const tenant = await prisma.tenant.create({ data: { slug: 'sesstest', nameEn: 'Sessions', nameAr: 'جلسات' } });
  const t = tenant.id;
  ids.jahra = (await prisma.pickupLocation.create({ data: { tenantId: t, nameEn: 'Jahra', hours: week } })).id;
  ids.ardiya = (await prisma.pickupLocation.create({ data: { tenantId: t, nameEn: 'Ardiya', hours: week } })).id;
  const password = await bcrypt.hash('secret123', 4);
  const user = (email, role, branchId = null) => prisma.user.create({ data: { tenantId: t, email, password, name: email, role, branchId } });
  await user('owner@sess.test', 'ADMIN');
  ids.staffUser = (await user('staff@sess.test', 'STAFF')).id;
  ids.jahraUser = (await user('jahra@sess.test', 'BRANCH', ids.jahra)).id;
  await user('ardiya@sess.test', 'BRANCH', ids.ardiya);

  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  await prisma.tenant.deleteMany({ where: { slug: 'sesstest' } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@sess.test' } } });
  server?.close();
  await prisma.$disconnect();
});

test('"sign out everywhere" ends every session of the account at once, renewal included', { skip }, async () => {
  const session = (await login('owner@sess.test')).body;
  assert.equal((await call('GET', '/auth/me', { token: session.token })).status, 200);
  assert.equal((await call('POST', '/auth/sign-out-everywhere', { token: session.token })).status, 200);
  assert.equal((await call('GET', '/auth/me', { token: session.token })).status, 401);
  assert.equal((await call('POST', '/auth/refresh', { body: { refreshToken: session.refreshToken } })).status, 401);
  // Signing in again works, with a fresh session.
  ids.owner = (await login('owner@sess.test')).body.token;
  assert.equal((await call('GET', '/auth/me', { token: ids.owner })).status, 200);
});

test('a new password, or a disabled account, ends that account\'s sessions', { skip }, async () => {
  const jahra = (await login('jahra@sess.test')).body.token;
  assert.equal((await call('GET', '/orders', { token: jahra })).status, 200);
  assert.equal((await call('PUT', `/users/${ids.jahraUser}`, { token: ids.owner, body: { password: 'secret123' } })).status, 200);
  assert.equal((await call('GET', '/orders', { token: jahra })).status, 401);

  const staff = (await login('staff@sess.test')).body.token;
  assert.equal((await call('PUT', `/users/${ids.staffUser}`, { token: ids.owner, body: { isActive: false } })).status, 200);
  assert.equal((await call('GET', '/orders', { token: staff })).status, 401);
  await call('PUT', `/users/${ids.staffUser}`, { token: ids.owner, body: { isActive: true } });
});

test('the owner can end any account\'s sessions; nobody else can', { skip }, async () => {
  const jahra = (await login('jahra@sess.test')).body.token;
  assert.equal((await call('POST', `/users/${ids.jahraUser}/sign-out`, { token: jahra })).status, 403);
  assert.equal((await call('POST', `/users/${ids.jahraUser}/sign-out`, { token: ids.owner })).status, 200);
  assert.equal((await call('GET', '/orders', { token: jahra })).status, 401);
});

test('without approved devices a branch account works from any device', { skip }, async () => {
  assert.equal((await login('jahra@sess.test')).status, 200);
});

test('once a branch has an approved device, its accounts work there only, whatever the address', { skip }, async () => {
  const approved = await call('POST', `/branch-devices/${ids.jahra}`, { token: ids.owner, body: { name: 'Jahra counter PC' } });
  assert.equal(approved.status, 201, JSON.stringify(approved.body));
  ids.jahraKey = approved.body.key;
  ids.jahraDevice = approved.body.device.id;
  // Only a hash is kept.
  const stored = await prisma.trustedDevice.findUnique({ where: { id: ids.jahraDevice } });
  assert.notEqual(stored.keyHash, ids.jahraKey);

  const refused = await login('jahra@sess.test');
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /not approved for this branch/);
  const session = (await login('jahra@sess.test', ids.jahraKey)).body.token;
  assert.equal((await call('GET', '/orders', { token: session, device: ids.jahraKey })).status, 200);
  assert.equal((await call('GET', '/orders', { token: session })).status, 403, 'the token alone, off the device, is not enough');
  // Another branch is not locked by Jahra's device.
  assert.equal((await login('ardiya@sess.test')).status, 200);
});

test("one branch's device does not open another branch", { skip }, async () => {
  await call('POST', `/branch-devices/${ids.ardiya}`, { token: ids.owner, body: { name: 'Ardiya tablet' } });
  assert.equal((await login('ardiya@sess.test', ids.jahraKey)).status, 403);
});

test('only the owner sees and manages devices, and a revoked device stops at once', { skip }, async () => {
  const session = (await login('jahra@sess.test', ids.jahraKey)).body.token;
  assert.equal((await call('GET', '/branch-devices', { token: session, device: ids.jahraKey })).status, 403);
  const list = await call('GET', '/branch-devices', { token: ids.owner });
  assert.deepEqual(list.body.map((d) => d.name).sort(), ['Ardiya tablet', 'Jahra counter PC']);
  assert.ok(!JSON.stringify(list.body).includes(ids.jahraKey), 'keys are never shown again');

  // A second device for Jahra, then the first one is revoked: the lock stays on, and the old key stops.
  const second = (await call('POST', `/branch-devices/${ids.jahra}`, { token: ids.owner, body: { name: 'Jahra tablet' } })).body.key;
  assert.equal((await call('DELETE', `/branch-devices/${ids.jahraDevice}`, { token: ids.owner })).status, 200);
  assert.equal((await call('GET', '/orders', { token: session, device: ids.jahraKey })).status, 403);
  assert.equal((await login('jahra@sess.test', second)).status, 200);
});
