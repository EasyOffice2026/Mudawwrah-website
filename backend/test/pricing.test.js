import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptedMethods, deliveryFeeFor, orderTotals, priceLines, round3, subtotalOf } from '../src/services/pricing.js';

const menu = [
  { id: 'shawarma', nameEn: 'Shawarma', nameAr: 'شاورما', price: '0.750', isAvailable: true, isOutOfStock: false },
  { id: 'karak', nameEn: 'Karak', nameAr: 'كرك', price: '0.300', isAvailable: true, isOutOfStock: false },
  { id: 'off', nameEn: 'Hidden', nameAr: 'مخفي', price: '1', isAvailable: false, isOutOfStock: false },
  { id: 'gone', nameEn: 'Sold', nameAr: 'نفد', price: '1', isAvailable: true, isOutOfStock: true },
];
const options = [
  { id: 'cheese', menuItemId: 'shawarma', nameEn: 'Cheese', nameAr: 'جبن', extraPrice: '0.150' },
  { id: 'large', menuItemId: 'shawarma', nameEn: 'Large', nameAr: 'كبير', extraPrice: '0.333' },
  { id: 'sugar', menuItemId: 'karak', nameEn: 'Sugar', nameAr: 'سكر', extraPrice: '0' },
];
const settings = { deliveryFee: '1', serviceChargePercent: '0', taxPercent: '0', paymentMethods: 'KNET,APPLE_PAY' };

test('KWD amounts are kept to three decimals, rounding the way the receipt shows them', () => {
  assert.equal(round3(0.1 + 0.2), 0.3);
  assert.equal(round3('1.23456'), 1.235);
  assert.equal(round3(2.0004), 2);
});

test("a line's price is the item's own plus its options' extras, times the quantity", () => {
  const [line] = priceLines([{ menuItemId: 'shawarma', quantity: 3, optionIds: ['cheese', 'large'] }], menu, options);
  assert.equal(line.unitPrice, 1.233); // 0.750 + 0.150 + 0.333
  assert.equal(line.lineTotal, 3.699);
  assert.deepEqual(line.customizations.map((c) => c.id), ['cheese', 'large']);
  const [plain] = priceLines([{ menuItemId: 'karak', quantity: 2 }], menu, options);
  assert.equal(plain.lineTotal, 0.6);
  assert.equal(plain.customizations, undefined);
  assert.equal(subtotalOf([line, plain]), 4.299);
});

test('only items of this menu that are available can be ordered', () => {
  assert.throws(() => priceLines([{ menuItemId: 'nope', quantity: 1 }], menu, options), (e) => e.status === 400);
  assert.throws(() => priceLines([{ menuItemId: 'off', quantity: 1 }], menu, options), (e) => e.status === 409);
  assert.throws(() => priceLines([{ menuItemId: 'gone', quantity: 1 }], menu, options), (e) => e.status === 409);
});

test("an option is only valid for its own item: another item's option is refused, not priced", () => {
  assert.throws(() => priceLines([{ menuItemId: 'karak', quantity: 1, optionIds: ['cheese'] }], menu, options), (e) => e.status === 400);
  assert.throws(() => priceLines([{ menuItemId: 'karak', quantity: 1, optionIds: ['invented'] }], menu, options), (e) => e.status === 400);
});

test("the delivery fee is the area's own, else the restaurant's; collecting costs nothing", () => {
  assert.equal(deliveryFeeFor('DELIVERY', { deliveryFee: 0.5 }, settings), 0.5);
  assert.equal(deliveryFeeFor('DELIVERY', { deliveryFee: 0 }, settings), 0, 'a free area stays free');
  assert.equal(deliveryFeeFor('DELIVERY', null, settings), 1);
  assert.equal(deliveryFeeFor('PICKUP', { deliveryFee: 0.5 }, settings), 0);
});

test('totals: items minus the voucher, plus delivery, service charge, tax and tip', () => {
  const totals = orderTotals({
    subtotal: 10,
    orderType: 'DELIVERY',
    deliveryFee: 1,
    discount: 2,
    settings: { serviceChargePercent: '10', taxPercent: '5' },
    tip: 0.5,
  });
  // 8 discounted; service 0.8 on 8; tax 5% of 8.8 = 0.44; total 8 + 1 + 0.8 + 0.44 + 0.5.
  assert.deepEqual(totals, { deliveryFee: 1, discountedSubtotal: 8, serviceCharge: 0.8, tax: 0.44, tip: 0.5, total: 10.74 });
});

test('a free-delivery voucher removes the fee; collection never carries a fee or a tip; a tip is never negative', () => {
  assert.equal(orderTotals({ subtotal: 5, orderType: 'DELIVERY', deliveryFee: 1, freeDelivery: true, settings }).total, 5);
  const pickup = orderTotals({ subtotal: 5, orderType: 'PICKUP', deliveryFee: 0, settings, tip: 1 });
  assert.deepEqual([pickup.tip, pickup.total], [0, 5]);
  assert.equal(orderTotals({ subtotal: 5, orderType: 'DELIVERY', deliveryFee: 0, settings, tip: -3 }).tip, 0);
});

test('missing percentages count as none rather than breaking the total', () => {
  assert.equal(orderTotals({ subtotal: 3, orderType: 'DELIVERY', deliveryFee: 0.5, settings: {} }).total, 3.5);
});

test("the restaurant's accepted payment methods, in its own order; KNET and card when it has not said", () => {
  assert.deepEqual(acceptedMethods(settings), ['KNET', 'APPLE_PAY']);
  assert.deepEqual(acceptedMethods({}), ['KNET', 'CARD']);
  assert.deepEqual(acceptedMethods({ paymentMethods: ' KNET , ' }), ['KNET']);
});
