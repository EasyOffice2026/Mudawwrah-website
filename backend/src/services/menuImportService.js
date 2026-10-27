import { z } from 'zod';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';

/**
 * Importing a menu from a spreadsheet: the quickest way to set up a new restaurant, or to update prices.
 *
 * Each row is one item: its category (English, and Arabic for a new category), its English and Arabic names, its
 * price, and optionally descriptions, calories and whether it is available. A category is matched by its English
 * name, an item by its English name within its category (both ignoring case and extra spaces): a match is
 * updated, anything else is created. Nothing is ever deleted, and pictures are added afterwards in the menu.
 *
 * plan() says what would happen without changing anything; apply() does it, all or nothing, and only when the
 * plan has no errors.
 */
const MAX_ROWS = 1000;

const text = (max) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(z.string().max(max));
const optionalText = (max) => text(max).optional().transform((v) => v || null);

const rowSchema = z.object({
  category: text(80).pipe(z.string().min(1, 'the category is missing')),
  categoryAr: optionalText(80),
  name: text(120).pipe(z.string().min(1, 'the name is missing')),
  nameAr: optionalText(120),
  price: z.coerce
    .number({ message: 'the price is not a number' })
    .min(0, 'the price cannot be negative')
    .max(10000, 'the price is too high')
    .refine((v) => Number(v.toFixed(3)) === v, 'the price has more than 3 decimals'),
  description: optionalText(1000),
  descriptionAr: optionalText(1000),
  calories: z
    // Empty first: a number rule would read an empty cell as 0.
    .union([z.literal(''), z.null(), z.coerce.number().int().min(0).max(10000)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
  available: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (typeof v === 'boolean' ? v : !/^(no|false|0|لا)$/i.test(String(v ?? 'yes').trim()))),
});

const key = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const slugify = (value) =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/(^-|-$)/g, '') || `category-${Date.now()}`;

// The item fields a row sets, as they are stored.
const fieldsOf = (row) => ({
  nameAr: row.nameAr,
  price: row.price,
  descriptionEn: row.description,
  descriptionAr: row.descriptionAr,
  calories: row.calories,
  isAvailable: row.available,
});
const differences = (item, fields) =>
  Object.entries(fields)
    .filter(([field, value]) => {
      const now = item[field];
      if (field === 'price') return Number(now) !== Number(value);
      return (now ?? null) !== (value ?? null);
    })
    .map(([field]) => field);

export const plan = async (rows) => {
  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'The file has no rows');
  if (rows.length > MAX_ROWS) throw new HttpError(400, `At most ${MAX_ROWS} rows at a time`);
  const tenantId = currentTenantId();
  const [categories, items] = await Promise.all([
    prisma.category.findMany({ where: { tenantId }, select: { id: true, nameEn: true } }),
    prisma.menuItem.findMany({
      where: { tenantId },
      select: { id: true, nameEn: true, nameAr: true, price: true, descriptionEn: true, descriptionAr: true, calories: true, isAvailable: true, categoryId: true },
    }),
  ]);
  const categoryByName = new Map(categories.map((c) => [key(c.nameEn), c]));
  const itemByName = new Map(items.map((i) => [`${i.categoryId}|${key(i.nameEn)}`, i]));

  const newCategories = new Map();
  const seen = new Set();
  const result = rows.map((raw, index) => {
    const row = index + 2; // as the spreadsheet numbers it, under its header row
    const parsed = rowSchema.safeParse(raw || {});
    if (!parsed.success) return { row, action: 'error', name: String(raw?.name || ''), error: parsed.error.issues.map((i) => i.message).join('; ') };
    const data = parsed.data;
    const category = categoryByName.get(key(data.category));
    if (!category && !newCategories.has(key(data.category))) {
      newCategories.set(key(data.category), { nameEn: data.category, nameAr: data.categoryAr || data.category });
    }
    const itemKey = `${key(data.category)}|${key(data.name)}`;
    if (seen.has(itemKey)) return { row, action: 'error', category: data.category, name: data.name, error: 'the same item appears twice in the file' };
    seen.add(itemKey);
    const existing = category ? itemByName.get(`${category.id}|${key(data.name)}`) : null;
    if (!existing) return { row, action: 'create', category: data.category, name: data.name, data };
    const changes = differences(existing, fieldsOf(data));
    return { row, action: changes.length ? 'update' : 'unchanged', category: data.category, name: data.name, changes, id: existing.id, data };
  });

  const count = (action) => result.filter((r) => r.action === action).length;
  return {
    newCategories: [...newCategories.values()].map((c) => c.nameEn),
    create: count('create'),
    update: count('update'),
    unchanged: count('unchanged'),
    errors: count('error'),
    rows: result.map(({ data, id, ...shown }) => shown),
    _work: { result, newCategories: [...newCategories.values()] },
  };
};

/** Applies a plan with no errors, all in one transaction. */
export const apply = async (rows) => {
  const planned = await plan(rows);
  if (planned.errors) throw new HttpError(422, `Fix the ${planned.errors} row(s) with errors first; nothing was imported`);
  const tenantId = currentTenantId();
  const { result, newCategories } = planned._work;
  await prisma.$transaction(
    async (tx) => {
      const categoryIds = new Map(
        (await tx.category.findMany({ where: { tenantId }, select: { id: true, nameEn: true, displayOrder: true } })).map((c) => [key(c.nameEn), c.id]),
      );
      let order = await tx.category.count({ where: { tenantId } });
      for (const category of newCategories) {
        let slug = slugify(category.nameEn);
        if (await tx.category.findFirst({ where: { tenantId, slug } })) slug = `${slug}-${Date.now().toString(36)}`;
        const created = await tx.category.create({ data: { tenantId, nameEn: category.nameEn, nameAr: category.nameAr, slug, displayOrder: order++ } });
        categoryIds.set(key(category.nameEn), created.id);
      }
      for (const entry of result) {
        if (entry.action === 'create') {
          await tx.menuItem.create({
            data: { tenantId, nameEn: entry.data.name, categoryId: categoryIds.get(key(entry.data.category)), ...fieldsOf(entry.data) },
          });
        } else if (entry.action === 'update') {
          await tx.menuItem.update({ where: { id: entry.id }, data: fieldsOf(entry.data) });
        }
      }
    },
    { timeout: 60_000 },
  );
  const { _work, ...summary } = planned;
  return summary;
};

/** The plan as shown to the owner (without the internal working data). */
export const preview = async (rows) => {
  const { _work, ...summary } = await plan(rows);
  return summary;
};
