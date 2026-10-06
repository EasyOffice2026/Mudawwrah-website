import assert from 'node:assert/strict';
import { test } from 'node:test';
import { branchCodes, dateKey, tenantCode } from '../src/services/orderNumber.js';

const branch = (id, nameEn, createdAt, orderCode = null) => ({ id, nameEn, createdAt, orderCode });

test("Modawarah's branches get readable codes from their names", () => {
  const codes = branchCodes([
    branch('aq', 'Al Aqeelah', '2026-10-01T00:00:00Z'),
    branch('ar', 'Al Ardiya', '2026-10-01T00:00:01Z'),
    branch('jh', 'Al Jahra', '2026-10-01T00:00:02Z'),
    branch('sa', 'Sabah Al Ahmed', '2026-10-01T00:00:03Z'),
  ]);
  assert.deepEqual(Object.fromEntries(codes), { aq: 'AQE', ar: 'ARD', jh: 'JAH', sa: 'SAB' });
});

test('two branches whose names start alike still get different codes, oldest keeps the short one', () => {
  const codes = branchCodes([branch('2', 'Salwa', '2026-02-01'), branch('1', 'Salmiya', '2026-01-01')]);
  assert.equal(codes.get('1'), 'SAL');
  assert.equal(codes.get('2'), 'SALW');
});

test("an owner-set code wins and is never handed to another branch", () => {
  const codes = branchCodes([branch('1', 'Sabah Al Ahmed', '2026-01-01'), branch('2', 'Salmiya', '2026-02-01', 'SAB')]);
  assert.equal(codes.get('2'), 'SAB');
  assert.equal(codes.get('1'), 'SABA');
});

test('an Arabic-only branch name still gets a usable code', () => {
  const codes = branchCodes([branch('1', 'صباح الأحمد', '2026-01-01'), branch('2', 'الجهراء', '2026-01-02')]);
  assert.equal(codes.get('1'), 'BRN1');
  assert.equal(codes.get('2'), 'BRN2');
});

test('the date is Kuwait’s, not the server’s', () => {
  // 7 PM in Kuwait is already the next day in Tokyo, where this server runs.
  const evening = new Date('2026-10-06T16:00:00Z');
  assert.equal(dateKey(evening, 'Asia/Kuwait'), '20261006');
  assert.equal(dateKey(evening, 'Asia/Tokyo'), '20261007');
});

test('restaurants without branches keep their two-letter code', () => {
  assert.equal(tenantCode({ slug: 'mdawra' }), 'MD');
  assert.equal(tenantCode({ slug: 'khobzt-marie' }), 'KH');
});
