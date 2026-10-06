import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeReport, normalisePhone, trafficSource } from '../src/services/reportCompute.js';
import { resolveRange } from '../src/services/reportRange.js';

const TZ = 'Asia/Kuwait';
// Tuesday 6 Oct 2026, 17:05 in Kuwait.
const NOW = new Date('2026-10-06T14:05:00Z');
const iso = (d) => d.toISOString();

test('today is compared with yesterday up to the same time', () => {
  const r = resolveRange({ preset: 'today' }, TZ, NOW);
  assert.equal(iso(r.from), '2026-10-05T21:00:00.000Z'); // midnight in Kuwait
  assert.equal(iso(r.to), iso(NOW));
  assert.equal(iso(r.prevFrom), '2026-10-04T21:00:00.000Z');
  assert.equal(iso(r.prevTo), '2026-10-05T14:05:00.000Z');
});

test('this week starts on Sunday in Kuwait and is compared with the same days last week', () => {
  const r = resolveRange({ preset: 'week' }, TZ, NOW);
  assert.equal(iso(r.from), '2026-10-03T21:00:00.000Z'); // Sunday 4 Oct, 00:00 Kuwait
  assert.equal(iso(r.prevFrom), '2026-09-26T21:00:00.000Z');
  assert.equal(r.prevTo - r.prevFrom, r.to - r.from);
});

test('this month is compared with the same days of last month', () => {
  const r = resolveRange({ preset: 'month' }, TZ, NOW);
  assert.equal(iso(r.from), '2026-09-30T21:00:00.000Z'); // 1 Oct, 00:00 Kuwait
  assert.equal(iso(r.prevFrom), '2026-08-31T21:00:00.000Z'); // 1 Sep
  assert.equal(iso(r.prevTo), '2026-09-06T14:05:00.000Z'); // 6 Sep, 17:05 in Kuwait
});

test('a custom range includes its last day and rejects nonsense', () => {
  const r = resolveRange({ preset: 'custom', from: '2026-09-21', to: '2026-09-30' }, TZ, NOW);
  assert.equal(iso(r.from), '2026-09-20T21:00:00.000Z');
  assert.equal(iso(r.to), '2026-09-30T21:00:00.000Z');
  assert.equal(iso(r.prevFrom), '2026-09-10T21:00:00.000Z');
  assert.throws(() => resolveRange({ preset: 'custom', from: '2026-09-30', to: '2026-09-21' }, TZ, NOW), RangeError);
  assert.throws(() => resolveRange({ preset: 'custom', from: '2026-02-30', to: '2026-03-01' }, TZ, NOW), RangeError);
  assert.throws(() => resolveRange({ preset: 'forever' }, TZ, NOW), RangeError);
});

test('one customer, however the phone was typed; junk numbers are left out', () => {
  assert.equal(normalisePhone('+965 9988 7766'), '99887766');
  assert.equal(normalisePhone('96599887766'), '99887766');
  assert.equal(normalisePhone('0096599887766'), '99887766');
  assert.equal(normalisePhone('5566-7788'), '55667788');
  assert.equal(normalisePhone('test'), null);
  assert.equal(normalisePhone('123456'), null);
});

test('traffic sources: utm tag first, then the referring site, else direct', () => {
  assert.equal(trafficSource({ referrer: 'https://l.instagram.com/' }), 'Instagram');
  assert.equal(trafficSource({ utmSource: 'ig' }), 'Instagram');
  assert.equal(trafficSource({ utmSource: 'IG', referrer: 'https://www.google.com/' }), 'Instagram');
  assert.equal(trafficSource({ referrer: 'https://www.google.com/' }), 'Google');
  assert.equal(trafficSource({ utmSource: 'newsletter' }), 'Newsletter');
  assert.equal(trafficSource({}), 'Direct');
});

// --- a small, fully known week ----------------------------------------------
const at = (kuwaitIso) => new Date(`${kuwaitIso}+03:00`);
const branches = [
  { id: 'sab', nameEn: 'Sabah', nameAr: 'صباح' },
  { id: 'ard', nameEn: 'Ardiya', nameAr: 'العارضية' },
];
const line = (menuItemId, nameEn, quantity, lineTotal, customizations = []) => ({ menuItemId, nameEn, quantity, lineTotal, customizations });
const base = { orderType: 'DELIVERY', channel: 'WEB', paymentMethod: 'KNET', paymentStatus: 'UNPAID', discount: 0 };
const orders = [
  // Monday 8 PM, Sabah, new customer, promo, Instagram, delivered in 50 min (late at 45)
  { ...base, id: 'o1', branchId: 'sab', status: 'DELIVERED', total: 10, customerPhone: '99887766', customerName: 'Sara', createdAt: at('2026-10-05T20:00:00'), promoCode: 'KARAK30', discount: 1, referrer: 'https://l.instagram.com/', zone: { nameEn: 'Salmiya' }, block: '4', outForDeliveryAt: at('2026-10-05T20:20:00'), deliveredAt: at('2026-10-05T20:50:00'), items: [line('burger', 'Burger', 2, 8, [{ id: 'cheese', nameEn: 'Cheese', extraPrice: 0.25 }])] },
  // Monday 8 PM, Sabah, returning customer typed with +965, quick delivery
  { ...base, id: 'o2', branchId: 'sab', status: 'DELIVERED', total: 6, customerPhone: '+965 5566 7788', customerName: 'Ali', createdAt: at('2026-10-05T20:30:00'), utmSource: 'ig', zone: { nameEn: 'Salmiya' }, block: '4', outForDeliveryAt: at('2026-10-05T20:40:00'), deliveredAt: at('2026-10-05T21:00:00'), items: [line('karak', 'Karak', 3, 6)] },
  // Tuesday, Ardiya, cancelled for a stated reason
  { ...base, id: 'o3', branchId: 'ard', status: 'CANCELLED', cancelReason: 'OUT_OF_STOCK', total: 4, customerPhone: '66554433', customerName: 'Noor', createdAt: at('2026-10-06T09:00:00'), items: [line('burger', 'Burger', 1, 4)] },
  // Tuesday, Ardiya, pickup, cash, unusable phone, slow but pickup is never "late"
  { ...base, id: 'o4', branchId: 'ard', orderType: 'PICKUP', paymentMethod: 'CASH', status: 'DELIVERED', total: 4, customerPhone: 'test', customerName: 'x', createdAt: at('2026-10-06T10:00:00'), readyAt: at('2026-10-06T10:15:00'), deliveredAt: at('2026-10-06T11:30:00'), items: [line('karak', 'Karak', 2, 4, [{ id: 'sugar', nameEn: 'Extra sugar', extraPrice: 0 }])] },
];
const prevOrders = [
  { status: 'CONFIRMED', total: 8, branchId: 'sab', createdAt: at('2026-09-28T12:00:00') },
  { status: 'CANCELLED', total: 5, branchId: 'sab', createdAt: at('2026-09-28T13:00:00') },
];
const history = [
  { customerPhone: '99887766', first: at('2026-10-05T20:00:00'), last: at('2026-10-05T20:00:00'), orders: 1, spend: 10 },
  { customerPhone: '55667788', first: at('2026-09-21T12:00:00'), last: at('2026-09-22T12:00:00'), orders: 2, spend: 9 },
  { customerPhone: '+96555667788', first: at('2026-10-05T20:30:00'), last: at('2026-10-05T20:30:00'), orders: 1, spend: 6 },
  { customerPhone: '90000000', first: at('2026-08-01T12:00:00'), last: at('2026-08-20T12:00:00'), orders: 3, spend: 30 },
];
const menuItems = [
  { id: 'burger', nameEn: 'Burger', categoryId: 'mains', isAvailable: true, isOutOfStock: false, createdAt: at('2026-01-01T00:00:00') },
  { id: 'karak', nameEn: 'Karak', categoryId: 'drinks', isAvailable: true, isOutOfStock: false, createdAt: at('2026-01-01T00:00:00') },
  { id: 'salad', nameEn: 'Salad', categoryId: 'mains', isAvailable: true, isOutOfStock: false, createdAt: at('2026-01-01T00:00:00') },
  { id: 'soup', nameEn: 'Soup', categoryId: 'mains', isAvailable: true, isOutOfStock: true, createdAt: at('2026-01-01T00:00:00') },
];
const categories = [
  { id: 'mains', nameEn: 'Mains' },
  { id: 'drinks', nameEn: 'Drinks' },
];
const range = resolveRange({ preset: 'week' }, TZ, NOW);
const report = computeReport({ range, orders, prevOrders, history, menuItems, categories, branches, visits: [{ day: '20261005', sessions: 30 }, { day: '20261006', sessions: 10 }], visitTrackingStart: '20261001', now: NOW, lateAfterMinutes: 45 });

test('sales: revenue and average order leave cancelled orders out and compare with last week', () => {
  assert.equal(report.sales.revenue, 20); // 10 + 6 + 4
  assert.equal(report.sales.orders, 3);
  assert.equal(report.sales.averageOrder, 6.667);
  assert.equal(report.sales.previous.revenue, 8);
  assert.equal(report.sales.revenueChange, 150); // 8 -> 20
  const sab = report.sales.branches.find((b) => b.id === 'sab');
  assert.deepEqual([sab.revenue, sab.orders, sab.previousRevenue, sab.revenueChange], [16, 2, 8, 100]);
  assert.equal(report.sales.branches.find((b) => b.id === 'ard').cancellationRate, 50);
});

test('orders: totals, cancellation rate and reasons, busiest hour, areas', () => {
  const o = report.orders;
  assert.deepEqual([o.placed, o.completed, o.cancelled, o.open], [4, 3, 1, 0]);
  assert.equal(o.cancellationRate, 25);
  assert.equal(o.previousCancellationRate, 50);
  assert.deepEqual(o.cancelReasons, [{ reason: 'OUT_OF_STOCK', orders: 1, share: 100 }]);
  assert.equal(o.heatmap[1][20], 2); // Monday, 8 PM Kuwait
  assert.deepEqual(o.peak, { day: 1, hour: 20, orders: 2 });
  assert.deepEqual(o.areas.map((a) => [a.area, a.orders]), [['Salmiya', 2]]);
  assert.deepEqual(o.blocks.map((b) => [b.area, b.block, b.orders]), [['Salmiya', '4', 2]]);
});

test('menu: best sellers by quantity vs revenue, add-ons per unit, slow movers, categories', () => {
  const m = report.menu;
  assert.deepEqual(m.topByQuantity.map((i) => [i.nameEn, i.quantity]), [['Karak', 5], ['Burger', 2]]);
  assert.deepEqual(m.topByRevenue.map((i) => [i.nameEn, i.revenue]), [['Karak', 10], ['Burger', 8]]);
  assert.deepEqual(m.addons.find((a) => a.key === 'cheese'), { key: 'cheese', nameEn: 'Cheese', nameAr: null, quantity: 2, revenue: 0.5 });
  // Salad never sold; Soup is out of stock so it isn't called slow.
  assert.equal(m.slowMovers[0].nameEn, 'Salad');
  assert.ok(!m.slowMovers.some((i) => i.nameEn === 'Soup'));
  // A product added part-way through the window is too new to judge.
  const fresh = computeReport({ range, orders, prevOrders, history, categories, branches, now: NOW, menuItems: [...menuItems, { id: 'wrap', nameEn: 'Wrap', categoryId: 'mains', isAvailable: true, isOutOfStock: false, createdAt: at('2026-10-05T12:00:00') }] });
  assert.ok(!fresh.menu.slowMovers.some((i) => i.nameEn === 'Wrap'));
  assert.deepEqual(m.categories.map((c) => [c.id, c.revenue, c.share]), [['drinks', 10, 55.6], ['mains', 8, 44.4]]);
});

test('customers: new vs returning, repeat rate, top spenders, 30-day lapsed', () => {
  const c = report.customers;
  assert.equal(c.customers, 2); // Sara and Ali; "test" isn't a customer
  assert.equal(c.invalidPhones, 1);
  assert.equal(c.newCustomers, 1); // Sara
  assert.equal(c.returningCustomers, 1); // Ali, first order in September
  assert.equal(c.customersEver, 3); // Ali's two phone spellings are one person
  assert.equal(c.repeatRate, 66.7); // Ali (3 orders) and 90000000 (3)
  assert.equal(c.topBySpend[0].phone, '99887766');
  assert.deepEqual(c.lapsed.map((p) => p.phone), ['90000000']);
});

test('a product listed in two sections, and an add-on on every item, each count as one', () => {
  const twice = [
    { ...base, id: 'p1', status: 'CONFIRMED', total: 1, customerPhone: '99887766', createdAt: at('2026-10-05T12:00:00'), items: [line('pepsi-picks', 'Pepsi', 2, 0.3, [{ id: 'ice-a', nameEn: 'Extra ice', extraPrice: 0 }])] },
    { ...base, id: 'p2', status: 'CONFIRMED', total: 1, customerPhone: '99887766', createdAt: at('2026-10-05T13:00:00'), items: [line('pepsi-drinks', 'Pepsi ', 3, 0.45, [{ id: 'ice-b', nameEn: 'extra ice', extraPrice: 0 }])] },
  ];
  const items2 = [
    { id: 'pepsi-picks', nameEn: 'Pepsi', categoryId: 'picks', isAvailable: true, isOutOfStock: false, createdAt: at('2026-01-01T00:00:00') },
    { id: 'pepsi-drinks', nameEn: 'Pepsi', categoryId: 'drinks', isAvailable: true, isOutOfStock: false, createdAt: at('2026-01-01T00:00:00') },
  ];
  const r = computeReport({ range, orders: twice, prevOrders: [], history: [], menuItems: items2, categories: [{ id: 'picks', nameEn: 'Picks' }, ...categories], branches, now: NOW });
  assert.deepEqual(r.menu.topByQuantity.map((i) => [i.nameEn, i.quantity]), [['Pepsi', 5]]);
  assert.deepEqual(r.menu.addons.map((a) => [a.key, a.quantity]), [['extra ice', 5]]);
  assert.deepEqual(r.menu.categories.map((c) => [c.id, c.quantity]), [['drinks', 3], ['picks', 2]]);
});

test('payments, promo codes, traffic sources and conversion', () => {
  assert.deepEqual(report.payments.methods.map((m) => [m.method, m.revenue]), [['KNET', 16], ['CASH', 4]]);
  assert.deepEqual(report.marketing.promos, [{ code: 'KARAK30', orders: 1, discount: 1, revenue: 10, averageOrder: 10 }]);
  assert.deepEqual(report.marketing.sources.map((s) => [s.source, s.orders]), [['Instagram', 2], ['Direct', 1]]);
  assert.equal(report.marketing.conversion.rate, 7.5); // 3 web orders / 40 visits
  // Counting began on Monday: Monday was a partial day, so the rate starts on
  // Tuesday — Tuesday's one order over Tuesday's visits, not 3 / 40.
  const mondayStart = computeReport({ range, orders, prevOrders, history, menuItems, categories, branches, visits: [{ day: '20261005', sessions: 30 }, { day: '20261006', sessions: 10 }], visitTrackingStart: '20261005', now: NOW });
  assert.deepEqual([mondayStart.marketing.conversion.orders, mondayStart.marketing.conversion.visits, mondayStart.marketing.conversion.rate], [1, 10, 10]);
  assert.equal(mondayStart.marketing.conversion.trackedSince, '20261006');
  // Counting began today: no full day yet, so no rate rather than a wrong one.
  const firstDay = computeReport({ range, orders, prevOrders, history, menuItems, categories, branches, visits: [{ day: '20261006', sessions: 10 }], visitTrackingStart: '20261006', now: NOW });
  assert.equal(firstDay.marketing.conversion.rate, null);
  const oneBranch = computeReport({ range, orders, prevOrders, history, menuItems, categories, branches, visits: [{ day: '20261005', sessions: 30 }], visitTrackingStart: '20261001', now: NOW, branchFiltered: true });
  assert.equal(oneBranch.marketing.conversion.available, false);
  assert.equal(oneBranch.marketing.conversion.rate, null);
});

test('operations: prep and delivery times, late deliveries only', () => {
  const ops = report.operations;
  assert.deepEqual([ops.prep.average, ops.prep.orders], [15, 3]); // 20, 10 and pickup 15 minutes
  assert.deepEqual([ops.delivery.average, ops.delivery.orders], [25, 2]); // 30 and 20
  assert.equal(ops.late, 1); // o1: 50 min; o4 is a pickup and never "late"
  assert.equal(ops.lateShare, 50);
  assert.equal(ops.trackedOrders, 3);
});
