/**
 * The money path, in a real browser: the built website, the real server and a throwaway PostgreSQL, the way a
 * customer and a branch use them. These are the checks that, until now, only the client did by hand.
 *
 *   1. A customer orders, chooses KNET, pays, and the order reaches the right branch's screen as paid.
 *   2. A customer who never pays never reaches any branch.
 *   3. The checkout offers only what the restaurant switched on, and no way round paying.
 *   4. A branch sees its own orders only.
 *
 * Run (CI does this, see .github/workflows/ci.yml):
 *   cd frontend && VITE_API_URL=http://127.0.0.1:4100/api npm run build
 *   cd e2e && npm ci && npx playwright install chromium
 *   E2E_DATABASE_URL=postgresql://... npm test        (a throwaway database with every migration applied)
 * On a computer with Chrome installed, E2E_CHROME_CHANNEL=chrome uses it instead of a downloaded browser.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';

const DB = process.env.E2E_DATABASE_URL;
const skip = !DB || /supabase|pooler|amazonaws/i.test(DB) ? 'needs E2E_DATABASE_URL (a throwaway database)' : false;

const here = path.dirname(fileURLToPath(import.meta.url));
const API_PORT = 4100; // the website is built to call this address
const WEB_PORT = 4173;
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const PASSWORD = 'e2e-secret-123';
const PAYING_PHONE = '55512345';

let prisma;
let api;
let web;
let browser;
const ids = {};

const week = Array.from({ length: 7 }, (_, day) => ({ day, closed: false, breaks: [], open: '00:00', close: '00:00' }));

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.JWT_SECRET = 'e2e-secret';
  process.env.CORS_ORIGINS = WEB;
  // The pretend gateway (it marks whatever it is asked to as paid), for this restaurant only.
  process.env.PAYMENT_PROVIDER = 'mock';
  process.env.ONLINE_PAYMENT_TENANTS = 'e2e';
  delete process.env.ONLINE_PAYMENT_PILOT_PHONES;
  process.env.PUBLIC_URL = API; // where the pretend payment page lives
  process.env.API_URL = API;
  process.env.STOREFRONT_URL = WEB;

  ({ prisma } = await import('../backend/src/prisma.js'));
  const { createApp } = await import('../backend/src/app.js');
  // The server's own copy, so the password hash is made exactly the way the server checks it.
  const bcrypt = createRequire(new URL('../backend/package.json', import.meta.url))('bcryptjs');

  await prisma.tenant.deleteMany({ where: { slug: 'e2e' } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e.test' } } });
  const tenant = await prisma.tenant.create({ data: { slug: 'e2e', nameEn: 'E2E Kitchen', nameAr: 'مطبخ' } });
  const t = tenant.id;
  await prisma.setting.create({ data: { tenantId: t, key: 'paymentMethods', value: 'KNET' } });
  const branch = (nameEn) => prisma.pickupLocation.create({ data: { tenantId: t, nameEn, hours: week } });
  ids.jahra = (await branch('Al Jahra')).id;
  ids.ardiya = (await branch('Al Ardiya')).id;
  await prisma.deliveryZone.create({ data: { tenantId: t, nameEn: 'Jahra', nameAr: 'الجهراء', branchId: ids.jahra, deliveryFee: 0.5, minimumOrder: 1 } });
  await prisma.deliveryZone.create({ data: { tenantId: t, nameEn: 'Ardiya', nameAr: 'العارضية', branchId: ids.ardiya, deliveryFee: 0.5, minimumOrder: 1 } });
  const category = await prisma.category.create({ data: { tenantId: t, nameEn: 'Mains', nameAr: 'رئيسي', slug: 'mains' } });
  ids.item = (await prisma.menuItem.create({ data: { tenantId: t, nameEn: 'Shawarma', nameAr: 'شاورما', price: 2.5, categoryId: category.id } })).id;
  const password = await bcrypt.hash(PASSWORD, 4);
  await prisma.user.create({ data: { tenantId: t, email: 'jahra@e2e.test', password, name: 'Jahra desk', role: 'BRANCH', branchId: ids.jahra } });
  await prisma.user.create({ data: { tenantId: t, email: 'ardiya@e2e.test', password, name: 'Ardiya desk', role: 'BRANCH', branchId: ids.ardiya } });

  api = await new Promise((resolve) => {
    const server = createApp().listen(API_PORT, '127.0.0.1', () => resolve(server));
  });
  // The built website, served the way Vercel serves it: files, and every other path to index.html.
  const dist = path.join(here, '..', 'frontend', 'dist');
  const site = express();
  site.use(express.static(dist));
  site.use((req, res) => res.sendFile(path.join(dist, 'index.html')));
  web = await new Promise((resolve) => {
    const server = site.listen(WEB_PORT, '127.0.0.1', () => resolve(server));
  });
  browser = await chromium.launch(process.env.E2E_CHROME_CHANNEL ? { channel: process.env.E2E_CHROME_CHANNEL } : {});
});

after(async () => {
  if (skip) return;
  await browser?.close();
  web?.close();
  api?.close();
  await prisma.tenant.deleteMany({ where: { slug: 'e2e' } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e.test' } } });
  await prisma.$disconnect();
});

/** A phone-sized page with a basket of two shawarmas already in it. */
const customerPage = async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const line = { key: ids.item, menuItemId: ids.item, nameEn: 'Shawarma', nameAr: 'شاورما', imageUrl: null, compareAtPrice: null, unitPrice: 2.5, quantity: 2, options: [] };
  const cart = { state: { lines: [line], tenantSlug: 'e2e', tenantName: 'E2E Kitchen', promo: null, cutlery: false, note: '', carts: {} }, version: 0 };
  await context.addInitScript((value) => localStorage.setItem('mdawra_cart', value), JSON.stringify(cart));
  const page = await context.newPage();
  await page.goto(`${WEB}/r/e2e`);
  await page.getByText('View cart').last().click({ timeout: 30000 });
  await page.getByRole('button', { name: /Checkout/ }).last().click();
  return { context, page };
};
const field = (page, label) => page.locator('label.label', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::input[1]');

/** Fills the checkout as a customer in Jahra and presses Place order. */
const placeOrder = async (page, { name, phone, area = 'Jahra' }) => {
  await field(page, 'Full name').fill(name);
  await field(page, 'Phone number').fill(phone);
  await page.locator('select').filter({ has: page.locator('option', { hasText: area }) }).selectOption({ label: area });
  for (const label of ['Building name', 'Apt\\. number', 'Floor', 'Street', 'Block']) await field(page, label).fill('1');
  await page.getByRole('button', { name: /Place order/ }).click();
};

/** A branch desk signed in, looking at its orders. */
const deskPage = async (email) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${WEB}/r/e2e/admin/login`);
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/admin(\/|$)/);
  await page.goto(`${WEB}/r/e2e/admin/orders`);
  return { context, page };
};

test('the checkout offers only what the restaurant switched on, and no way round paying', { skip }, async () => {
  const { context, page } = await customerPage();
  await page.getByText('Select payment method', { exact: true }).waitFor();
  assert.equal(await page.locator('input[name=paymentChoice]').count(), 1, 'KNET only');
  assert.equal(await page.getByText('Order via WhatsApp').count(), 0, 'no unpaid way to order');
  await context.close();
});

test('a customer pays with KNET and the order reaches its branch as paid', { skip }, async () => {
  const { context, page } = await customerPage();
  await placeOrder(page, { name: 'Paying customer', phone: PAYING_PHONE });
  // On to the payment page (the pretend one records the payment and says so).
  await page.waitForURL(/\/api\/payments\/mock\/pay/, { timeout: 30000 });
  const said = await page.locator('body').innerText();
  const number = /order (\S+)\./.exec(said)?.[1];
  assert.ok(number, said);
  ids.paidOrder = number;
  const stored = await prisma.order.findFirst({ where: { orderNumber: number } });
  assert.deepEqual([stored.paymentStatus, stored.branchId], ['PAID', ids.jahra]);
  await context.close();

  const desk = await deskPage('jahra@e2e.test');
  await desk.page.getByText(number).first().waitFor({ timeout: 30000 });
  await desk.context.close();
});

test('a customer who never pays never reaches any branch', { skip }, async () => {
  const { context, page } = await customerPage();
  // The customer leaves at the payment page.
  await page.route(/\/api\/payments\/mock\/pay/, (route) => route.abort());
  await placeOrder(page, { name: 'Leaving customer', phone: '55598765' });
  await page.waitForTimeout(1500);
  const unpaid = await prisma.order.findFirst({ where: { customerName: 'Leaving customer' } });
  assert.equal(unpaid.paymentStatus, 'PENDING');
  await context.close();

  const desk = await deskPage('jahra@e2e.test');
  await desk.page.getByText(ids.paidOrder).first().waitFor({ timeout: 30000 });
  assert.equal(await desk.page.getByText(unpaid.orderNumber).count(), 0);
  await desk.context.close();
});

test("a branch sees its own orders only, never another branch's", { skip }, async () => {
  const desk = await deskPage('ardiya@e2e.test');
  await desk.page.getByRole('heading', { name: /Orders/ }).first().waitFor({ timeout: 30000 });
  await desk.page.waitForTimeout(1500);
  assert.equal(await desk.page.getByText(ids.paidOrder).count(), 0);
  await desk.context.close();
});
