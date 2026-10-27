/**
 * The menu spreadsheet: its columns, reading a table (from Excel or CSV) into rows for the server, and CSV itself.
 * Headers may be in English or Arabic, in any order, and columns the import does not know are ignored.
 */
export const COLUMNS = [
  { key: 'category', en: 'Category', ar: 'الفئة' },
  { key: 'categoryAr', en: 'Category (Arabic)', ar: 'الفئة (عربي)' },
  { key: 'name', en: 'Name', ar: 'الاسم' },
  { key: 'nameAr', en: 'Name (Arabic)', ar: 'الاسم (عربي)' },
  { key: 'price', en: 'Price (KWD)', ar: 'السعر' },
  { key: 'description', en: 'Description', ar: 'الوصف' },
  { key: 'descriptionAr', en: 'Description (Arabic)', ar: 'الوصف (عربي)' },
  { key: 'calories', en: 'Calories', ar: 'السعرات' },
  { key: 'available', en: 'Available (yes/no)', ar: 'متوفر' },
];

const simple = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, (m) => (/(arabic|عربي)/.test(m) ? ' ar' : ''))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const LOOKUP = new Map(COLUMNS.flatMap((c) => [simple(c.en), simple(c.ar), simple(c.key)].map((h) => [h, c.key])));

/** Which column a header names, or null for one the import does not use. */
export const columnOf = (header) => LOOKUP.get(simple(header)) || null;

/** A table (first row: headers) as rows for the server; blank rows are left out. */
export const rowsFromTable = (table) => {
  const [header = [], ...body] = table || [];
  const keys = header.map(columnOf);
  return body
    .filter((cells) => (cells || []).some((cell) => String(cell ?? '').trim() !== ''))
    .map((cells) => {
      const row = {};
      keys.forEach((key, index) => {
        if (key && cells[index] !== undefined && cells[index] !== null) row[key] = typeof cells[index] === 'string' ? cells[index].trim() : cells[index];
      });
      return row;
    });
};

/** CSV as a table: commas, quoted fields (with commas, quotes and line breaks inside), Windows line ends, BOM. */
export const parseCsv = (text) => {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const table = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      table.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    table.push(row);
  }
  return table;
};

/** The template to fill in: the headers, and two example rows to replace. */
export const templateTable = () => [
  COLUMNS.map((c) => c.en),
  ['Sandwiches', 'سندويشات', 'Chicken shawarma', 'شاورما دجاج', 0.75, 'With garlic sauce', 'مع صوص الثوم', 450, 'yes'],
  ['Drinks', 'مشروبات', 'Karak', 'كرك', 0.3, '', '', '', 'yes'],
];
