import assert from 'node:assert/strict';
import { test } from 'node:test';
import { columnOf, parseCsv, rowsFromTable, templateTable } from '../src/lib/menuSheet.js';

test('headers are recognised in English or Arabic, whatever their case or spacing', () => {
  assert.equal(columnOf('Category'), 'category');
  assert.equal(columnOf(' category (ARABIC) '), 'categoryAr');
  assert.equal(columnOf('الاسم (عربي)'), 'nameAr');
  assert.equal(columnOf('Price (KWD)'), 'price');
  assert.equal(columnOf('price'), 'price');
  assert.equal(columnOf('Notes for the chef'), null);
});

test('a table becomes rows keyed by column, skipping blank rows and unknown columns', () => {
  const rows = rowsFromTable([
    ['Name', 'Category', 'Price (KWD)', 'Something else'],
    [' Karak ', 'Drinks', 0.3, 'ignored'],
    ['', '', '', ''],
    ['Tea', 'Drinks', '0.2', null],
  ]);
  assert.deepEqual(rows, [
    { name: 'Karak', category: 'Drinks', price: 0.3 },
    { name: 'Tea', category: 'Drinks', price: '0.2' },
  ]);
});

test('CSV: quotes, commas and line breaks inside fields, doubled quotes, Windows line ends and a BOM', () => {
  const csv = '\uFEFFName,Description,Price\r\n"Wrap, large","Says ""hot""\nand spicy",1.250\r\nKarak,,0.3\r\n';
  assert.deepEqual(parseCsv(csv), [
    ['Name', 'Description', 'Price'],
    ['Wrap, large', 'Says "hot"\nand spicy', '1.250'],
    ['Karak', '', '0.3'],
  ]);
  assert.deepEqual(parseCsv('a,b\nc,d'), [['a', 'b'], ['c', 'd']], 'no line end at the end');
});

test('the template reads back as the rows it shows', () => {
  const rows = rowsFromTable(templateTable());
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['available', 'calories', 'category', 'categoryAr', 'description', 'descriptionAr', 'name', 'nameAr', 'price']);
});
