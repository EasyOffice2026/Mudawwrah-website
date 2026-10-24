/**
 * Read-only: is each branch actually working its orders?
 *
 *   cd backend && node scripts/branch-status.mjs [restaurant-slug]
 *
 * For every branch: its newest order, the last time staff confirmed one, how many are still
 * PENDING from the last 48 hours, the IP addresses its accounts are locked to, and its login.
 * It changes nothing and holds one database connection.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const slug = process.argv[2] || 'mdawra';
const url = process.env.DATABASE_URL.replace(/connection_limit=\d+/, 'connection_limit=1');
const prisma = new PrismaClient({ datasources: { db: { url } } });
const kuwait = (d) => (d ? new Date(d.getTime() + 3 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : '-');

try {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`No restaurant "${slug}"`);
  const since = new Date(Date.now() - 48 * 3600e3);
  console.log(`Kuwait time now: ${kuwait(new Date())}\n`);

  const branches = await prisma.pickupLocation.findMany({ where: { tenantId: tenant.id }, orderBy: { displayOrder: 'asc' } });
  for (const b of branches) {
    const where = { tenantId: tenant.id, branchId: b.id };
    const [latest, acted, pending, total, logins] = await Promise.all([
      prisma.order.findFirst({ where, orderBy: { createdAt: 'desc' }, select: { orderNumber: true, createdAt: true, status: true } }),
      prisma.order.findFirst({ where: { ...where, confirmedAt: { not: null } }, orderBy: { confirmedAt: 'desc' }, select: { orderNumber: true, confirmedAt: true } }),
      prisma.order.count({ where: { ...where, status: 'PENDING', createdAt: { gt: since } } }),
      prisma.order.count({ where: { ...where, createdAt: { gt: since } } }),
      prisma.user.findMany({ where: { tenantId: tenant.id, branchId: b.id }, select: { email: true, isActive: true } }),
    ]);
    console.log(`${b.nameEn}${b.isActive ? '' : '  (INACTIVE)'}`);
    console.log(`  newest order        : ${latest ? `${latest.orderNumber}  ${kuwait(latest.createdAt)}  ${latest.status}` : 'none'}`);
    console.log(`  last confirmed      : ${acted ? `${acted.orderNumber}  ${kuwait(acted.confirmedAt)}` : 'never'}`);
    console.log(`  waiting (48 h)      : ${pending} of ${total}`);
    console.log(`  locked to addresses : ${b.allowedIps.length ? b.allowedIps.join(', ') : '(none: open from anywhere)'}`);
    console.log(`  logins              : ${logins.map((u) => `${u.email}${u.isActive ? '' : ' (disabled)'}`).join(', ') || 'none'}\n`);
  }
} catch (error) {
  console.error('Could not check:', String(error.message).split('\n').filter(Boolean).pop());
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
