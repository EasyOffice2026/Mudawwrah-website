/**
 * Re-points every stored media URL at the current PUBLIC_URL.
 *
 * Image URLs are written absolute at upload time, so they still name whatever
 * host was configured then. When the public address changes — a new ngrok
 * hostname, or moving to a real domain — every picture 404s until this is run.
 *
 *   node prisma/rebase-media.js
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const target = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

if (!target) {
  console.error('PUBLIC_URL is not set — nothing to rebase onto.');
  process.exit(1);
}

/** Keeps the /uploads/... tail, swaps whatever host precedes it. */
const rebase = (url) => {
  if (!url) return url;
  const index = url.indexOf('/uploads/');
  return index === -1 ? url : target + url.slice(index);
};

const run = async () => {
  const media = await prisma.media.findMany({ select: { id: true, url: true, thumbnailUrl: true } });
  let changed = 0;

  for (const item of media) {
    const url = rebase(item.url);
    const thumbnailUrl = rebase(item.thumbnailUrl);
    if (url === item.url && thumbnailUrl === item.thumbnailUrl) continue;
    await prisma.media.update({ where: { id: item.id }, data: { url, thumbnailUrl } });
    changed += 1;
  }

  // Tenant hero shots are stored on the tenant, not in Media.
  const tenants = await prisma.tenant.findMany({ select: { id: true, heroUrl: true, logoUrl: true } });
  for (const tenant of tenants) {
    const heroUrl = rebase(tenant.heroUrl);
    const logoUrl = rebase(tenant.logoUrl);
    if (heroUrl === tenant.heroUrl && logoUrl === tenant.logoUrl) continue;
    await prisma.tenant.update({ where: { id: tenant.id }, data: { heroUrl, logoUrl } });
    changed += 1;
  }

  console.log(`Rebased ${changed} record(s) onto ${target}`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
