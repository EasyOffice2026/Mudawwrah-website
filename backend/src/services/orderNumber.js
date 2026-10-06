import { prisma } from '../prisma.js';

/**
 * Order numbers: a code, the restaurant's own calendar date, and a counter
 * that restarts every day — SAB20261006-0001.
 *
 * Each branch counts its own orders under its own code, so a branch's kitchen
 * reads 0001, 0002, 0003 rather than whichever numbers the other branches left
 * over. Restaurants without branches keep their two-letter code (MD…).
 *
 * The date is the restaurant's, never the server's: on a server in another
 * timezone (this one ran on Tokyo time) every evening order in Kuwait was
 * numbered with tomorrow's date and the count restarted at 6 PM.
 */

const SKIP_WORDS = new Set(['AL', 'EL', 'THE']);

/** The restaurant's code: the first two letters of its slug, as order numbers have always used. */
export const tenantCode = (tenant) =>
  (tenant?.slug || 'md').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || 'MD';

/** YYYYMMDD for an instant, as the calendar reads it in that timezone. */
export const dateKey = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date)
    .replace(/-/g, '');

/** Codes worth trying for a branch name, best first: "Sabah Al Ahmed" → SAB, SABA, SABAH, SAB1… */
const candidates = (name) => {
  const letters = String(name || '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((word) => word && !SKIP_WORDS.has(word))
    .join('');
  // A name with no Latin letters (Arabic only) still gets a usable code.
  const base = letters.length >= 3 ? letters.slice(0, 3) : 'BRN';
  const list = letters.length >= 3 ? [letters.slice(0, 3), letters.slice(0, 4), letters.slice(0, 5)] : [];
  for (let n = 1; n <= 99; n += 1) list.push(`${base}${n}`);
  return list;
};

/**
 * Each branch's code, keyed by branch id. A code the owner set wins; the rest
 * come from the name, skipping any already taken so two branches never share
 * one (Salmiya → SAL, Salwa → SALW). Branches are taken oldest first, so a new
 * branch can never take over an existing branch's code.
 */
export const branchCodes = (branches) => {
  const ordered = [...branches].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a.id).localeCompare(String(b.id)));
  const taken = new Set(ordered.map((b) => b.orderCode).filter(Boolean));
  const codes = new Map();
  for (const branch of ordered) {
    if (branch.orderCode) {
      codes.set(branch.id, branch.orderCode);
      continue;
    }
    const code = candidates(branch.nameEn).find((c) => !taken.has(c));
    taken.add(code);
    codes.set(branch.id, code);
  }
  return codes;
};

/**
 * Hands out the next number for a prefix in one atomic statement, so two
 * orders placed at the same moment can never get the same number (the old
 * "count today's orders + 1" gave both the same, and the second order failed).
 * A prefix seen for the first time starts after the highest number already
 * used with it, so switching over mid-day never repeats a number.
 */
export const nextValue = async (tenantId, prefix) => {
  const [row] = await prisma.$queryRaw`
    INSERT INTO "OrderCounter" ("tenantId", "prefix", "value")
    VALUES (${tenantId}, ${prefix}, COALESCE((
      SELECT MAX(CAST(SUBSTRING("orderNumber" FROM '-([0-9]+)$') AS INTEGER))
      FROM "Order"
      WHERE "tenantId" = ${tenantId} AND "orderNumber" LIKE ${`${prefix}-%`}
    ), 0) + 1)
    ON CONFLICT ("tenantId", "prefix") DO UPDATE SET "value" = "OrderCounter"."value" + 1
    RETURNING "value"`;
  return Number(row.value);
};

/** Must run inside the restaurant's tenant context (branches are looked up scoped to it). */
export const nextOrderNumber = async ({ tenant, branchId, timeZone, now = new Date() }) => {
  let code = tenantCode(tenant);
  if (branchId) {
    const branches = await prisma.pickupLocation.findMany({
      select: { id: true, nameEn: true, orderCode: true, createdAt: true },
    });
    const branch = branches.find((b) => b.id === branchId);
    if (branch) {
      code = branchCodes(branches).get(branchId);
      // A derived code is fixed on first use, so renaming the branch later
      // can't quietly start it on a new set of numbers.
      if (!branch.orderCode) await prisma.pickupLocation.update({ where: { id: branchId }, data: { orderCode: code } });
    }
  }
  const prefix = `${code}${dateKey(now, timeZone)}`;
  const value = await nextValue(tenant.id, prefix);
  return `${prefix}-${String(value).padStart(4, '0')}`;
};
