/**
 * Read-only: are two databases holding the same data? For moving the database (see DEPLOY.md, "Moving the
 * database"): run it after the copy and before switching Render over.
 *
 *   node scripts/compare-db.mjs "<old database URL>" "<new database URL>"
 *
 * For every table it counts the rows on both sides, and for orders it also compares the newest order and the
 * money total. It changes nothing and holds one connection to each database.
 */
import { PrismaClient } from '@prisma/client';

const [oldUrl, newUrl] = process.argv.slice(2);
if (!oldUrl || !newUrl) {
  console.error('Usage: node scripts/compare-db.mjs "<old database URL>" "<new database URL>"');
  process.exit(1);
}
const one = (url) => new PrismaClient({ datasources: { db: { url: url.includes('connection_limit') ? url : `${url}${url.includes('?') ? '&' : '?'}connection_limit=1` } } });
const left = one(oldUrl);
const right = one(newUrl);

const tablesOf = async (db) =>
  (await db.$queryRawUnsafe("select tablename from pg_tables where schemaname = 'public' order by 1")).map((r) => r.tablename);
const countOf = async (db, table) => Number((await db.$queryRawUnsafe(`select count(*)::bigint as n from public."${table}"`))[0].n);
const ordersOf = async (db) =>
  (await db.$queryRawUnsafe('select max("createdAt") as newest, coalesce(sum(total), 0)::text as money from public."Order"'))[0];

let same = true;
try {
  const tables = [...new Set([...(await tablesOf(left)), ...(await tablesOf(right))])];
  console.log(`${'table'.padEnd(26)}${'old'.padStart(10)}${'new'.padStart(10)}`);
  for (const table of tables) {
    const [a, b] = await Promise.all([countOf(left, table).catch(() => NaN), countOf(right, table).catch(() => NaN)]);
    const ok = a === b;
    same &&= ok;
    console.log(`${table.padEnd(26)}${String(a).padStart(10)}${String(b).padStart(10)}${ok ? '' : '   <-- DIFFERENT'}`);
  }
  const [a, b] = await Promise.all([ordersOf(left), ordersOf(right)]);
  const ordersSame = String(a.newest) === String(b.newest) && a.money === b.money;
  same &&= ordersSame;
  console.log(`\nnewest order: ${a.newest?.toISOString?.() ?? a.newest} | ${b.newest?.toISOString?.() ?? b.newest}`);
  console.log(`order money total: ${a.money} | ${b.money}${ordersSame ? '' : '   <-- DIFFERENT'}`);
  console.log(same ? '\nSAME: the new database holds everything the old one does.' : '\nNOT THE SAME: do not switch over. Copy again.');
} finally {
  await Promise.all([left.$disconnect(), right.$disconnect()]);
}
process.exit(same ? 0 : 2);
