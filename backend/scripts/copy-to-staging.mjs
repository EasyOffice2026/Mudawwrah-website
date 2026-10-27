/**
 * Fills the staging copy with the live restaurants' set-up, so tests run on the real menu (DEPLOY.md, "Staging").
 *
 *   node scripts/copy-to-staging.mjs "<live database URL>" "<staging database URL>"            (shows what it would do)
 *   node scripts/copy-to-staging.mjs "<live database URL>" "<staging database URL>" --apply    (does it)
 *   ... --tenant mdawra                                                                       (one restaurant only)
 *
 * Copied: each restaurant with its settings, pictures (they keep pointing at the live site's images), branches,
 * delivery areas, categories, items with their options, banners and offers.
 * Never copied: orders, customers, staff accounts and passwords, WhatsApp conversations, approved devices, and
 * every secret (Tap key, WhatsApp and Foodics tokens). The restaurant's own domain and the tracking pixel IDs are
 * left out too, so staging never answers on the real domain or counts as visits in the restaurant's ads.
 * Each restaurant gets one fresh owner account on staging, whose password is shown once.
 *
 * It only reads the live database. On staging it replaces those restaurants entirely (their staging orders go
 * with them). It refuses to run when both addresses are the same database.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const [liveUrl, stagingUrl, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
const only = flags.includes('--tenant') ? flags[flags.indexOf('--tenant') + 1] : null;

const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};
if (!liveUrl || !stagingUrl) fail('Usage: node scripts/copy-to-staging.mjs "<live URL>" "<staging URL>" [--apply] [--tenant slug]');

const where = (url) => {
  const u = new URL(url);
  // Supabase's pooler names the project in the user ("postgres.<project>"): part of what makes a database itself.
  return `${u.username}@${u.hostname}:${u.port || 5432}${u.pathname}`;
};
if (where(liveUrl) === where(stagingUrl)) fail('The live and staging addresses are the same database. Nothing was done.');

const client = (url) => new PrismaClient({ datasources: { db: { url: url.includes('connection_limit') ? url : `${url}${url.includes('?') ? '&' : '?'}connection_limit=1` } } });
const live = client(liveUrl);
const staging = client(stagingUrl);

const TRACKING = ['trackingGa4', 'trackingGtm', 'trackingMetaPixel', 'trackingTiktokPixel', 'trackingSnapPixel'];
const withoutSecrets = (tenant) => ({
  ...tenant,
  customDomain: null,
  whatsappPhoneNumberId: null,
  whatsappAccessToken: null,
  foodicsAccessToken: null,
  foodicsWebhookSecret: null,
  tapSecretKey: null,
});

try {
  const tenants = await live.tenant.findMany({ where: { isActive: true, ...(only ? { slug: only } : {}) } });
  if (!tenants.length) fail(only ? `No active restaurant "${only}" on live.` : 'No active restaurants on live.');
  const ids = tenants.map((t) => t.id);
  const byTenant = { where: { tenantId: { in: ids } } };

  const [settings, media, branches, zones, categories, items, banners, promotions] = await Promise.all([
    live.setting.findMany(byTenant),
    live.media.findMany(byTenant),
    live.pickupLocation.findMany(byTenant),
    live.deliveryZone.findMany(byTenant),
    live.category.findMany(byTenant),
    live.menuItem.findMany(byTenant),
    live.banner.findMany(byTenant),
    live.promotion.findMany(byTenant),
  ]);
  const options = await live.customizationOption.findMany({ where: { menuItemId: { in: items.map((i) => i.id) } } });

  console.log(`From ${where(liveUrl)} (read only) to ${where(stagingUrl)}:`);
  for (const tenant of tenants) {
    const mine = (rows) => rows.filter((r) => r.tenantId === tenant.id).length;
    console.log(
      `  ${tenant.slug}: ${mine(branches)} branches, ${mine(zones)} areas, ${mine(categories)} categories, ${mine(items)} items, ` +
        `${mine(media)} pictures, ${mine(banners)} banners, ${mine(promotions)} offers, ${mine(settings)} settings`,
    );
  }
  console.log(`  + ${options.length} item options. Not copied: orders, customers, staff, devices, secrets, domain, tracking IDs.`);
  if (!apply) {
    console.log('\nNothing was changed. Run again with --apply to copy.');
    process.exit(0);
  }

  const owners = [];
  await staging.$transaction(
    async (tx) => {
      // The staging copies of these restaurants go first, with everything that hangs off them.
      await tx.tenant.deleteMany({ where: { id: { in: ids } } });
      await tx.tenant.deleteMany({ where: { slug: { in: tenants.map((t) => t.slug) } } });
      await tx.tenant.createMany({ data: tenants.map(withoutSecrets) });
      await tx.setting.createMany({ data: settings.filter((s) => !TRACKING.includes(s.key)) });
      await tx.media.createMany({ data: media });
      await tx.pickupLocation.createMany({ data: branches.map((b) => ({ ...b, allowedIps: [] })) });
      await tx.deliveryZone.createMany({ data: zones });
      await tx.category.createMany({ data: categories });
      await tx.menuItem.createMany({ data: items });
      await tx.customizationOption.createMany({ data: options });
      await tx.banner.createMany({ data: banners });
      await tx.promotion.createMany({ data: promotions });
      for (const tenant of tenants) {
        const email = `staging-owner@${tenant.slug}.test`;
        const password = crypto.randomBytes(9).toString('base64url');
        await tx.user.deleteMany({ where: { email } });
        await tx.user.create({ data: { tenantId: tenant.id, email, password: await bcrypt.hash(password, 10), name: 'Staging owner', role: 'ADMIN' } });
        owners.push({ slug: tenant.slug, email, password });
      }
    },
    { timeout: 120_000 },
  );
  console.log('\nCopied. Owner accounts on staging (shown once, keep them somewhere safe):');
  for (const o of owners) console.log(`  ${o.slug}: ${o.email}  ${o.password}`);
} finally {
  await Promise.all([live.$disconnect(), staging.$disconnect()]);
}
