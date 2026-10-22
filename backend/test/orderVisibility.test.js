import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivedAfter, hiddenWhileUnpaid, isAwaitingPayment } from '../src/services/orderVisibility.js';
import { computeReport } from '../src/services/reportCompute.js';
import { resolveRange } from '../src/services/reportRange.js';

test('an order waiting for its online payment is recognised, and nothing else is', () => {
  assert.equal(isAwaitingPayment({ paymentStatus: 'PENDING' }), true);
  for (const paymentStatus of ['UNPAID', 'PAID', 'FAILED']) assert.equal(isAwaitingPayment({ paymentStatus }), false);
  assert.equal(isAwaitingPayment(null), false);
  assert.deepEqual(hiddenWhileUnpaid, { paymentStatus: { not: 'PENDING' } });
});

test('an online order arrives when it is paid, an ordinary one when it is placed', () => {
  const since = new Date('2026-10-22T10:00:00Z');
  assert.deepEqual(arrivedAfter(since), {
    OR: [{ paidAt: null, createdAt: { gt: since } }, { paidAt: { gt: since } }],
  });
});

// --- Reports: unpaid online orders are not sales, but they are "abandoned" -------------------
const NOW = new Date('2026-10-06T14:05:00Z');
const range = resolveRange({ preset: 'today' }, 'Asia/Kuwait', NOW);
const order = (over) => ({
  orderType: 'DELIVERY', channel: 'WEB', paymentMethod: 'KNET', paymentStatus: 'PAID', status: 'CONFIRMED', discount: 0,
  customerPhone: '99887766', branchId: 'b1', total: '5.000', createdAt: new Date('2026-10-06T08:00:00Z'), items: [], ...over,
});
const report = (orders) =>
  computeReport({ range, orders, prevOrders: [], history: [], menuItems: [], categories: [], branches: [{ id: 'b1', nameEn: 'B', nameAr: 'ب' }], now: NOW, onlinePayments: true });

test('a payment still pending is not counted as a sale, however old', () => {
  const r = report([
    order({}),
    order({ paymentStatus: 'PENDING', status: 'PENDING', total: '9.000', createdAt: new Date('2026-10-06T07:00:00Z') }),
  ]);
  assert.equal(r.sales.revenue, 5);
  assert.equal(r.sales.orders, 1);
});

test('the Payments report still counts the unpaid online orders as abandoned after 30 minutes', () => {
  const r = report([
    order({}),
    order({ paymentStatus: 'PENDING', status: 'PENDING', total: '9.000', createdAt: new Date('2026-10-06T07:00:00Z') }),
    order({ paymentStatus: 'PENDING', status: 'PENDING', total: '2.000', createdAt: new Date('2026-10-06T14:00:00Z') }),
  ]);
  assert.deepEqual(r.payments.abandoned, { orders: 1, value: 9 });
  assert.deepEqual(r.payments.methods.map((m) => [m.method, m.revenue]), [['KNET', 5]]);
});
