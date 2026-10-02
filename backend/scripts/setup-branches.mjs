// Applies the restaurant's branch setup: opening hours (with the Friday prayer
// break) and the delivery areas each branch serves. Safe to run again: hours are
// overwritten, areas are added or updated by name, nothing is deleted.
//
//   node scripts/setup-branches.mjs --tenant mdawra            dry run: prints the plan, writes nothing
//   node scripts/setup-branches.mjs --tenant mdawra --apply    writes it
//
// Fee and minimum stay empty on every area, so the Settings values apply
// (1.000 KWD / 2.000 KWD, the same everywhere per the client).
import { PrismaClient } from '@prisma/client';

const FRIDAY_PRAYER = { from: '11:00', to: '12:00' };
const week = (open, close) =>
  Array.from({ length: 7 }, (_, day) => ({ day, open, close, closed: false, breaks: day === 5 ? [FRIDAY_PRAYER] : [] }));
const ALL_DAY = week('00:00', '00:00');

// Areas read off the delivery maps the client sent (only those labelled inside
// each branch's red area), confirmed by the client; Moath may still add areas.
const BRANCHES = [
  {
    name: 'Al Aqeelah',
    hours: ALL_DAY,
    areas: [
      ['Egaila', 'العقيلة'],
      ['Sabah Al-Salem', 'صباح السالم'],
      ['Al-Masayel', 'المسايل'],
      ['Fnaitees', 'فنيطيس'],
      ['Mubarak Al-Kabeer', 'مبارك الكبير'],
      ['Daher', 'الظهر'],
      ['Mahboula', 'المهبولة'],
      ['Mangaf', 'المنقف'],
      ['Fahaheel', 'الفحيحيل'],
    ],
  },
  {
    name: 'Al Jahra',
    hours: ALL_DAY,
    areas: [
      ['Jahra', 'الجهراء'],
      ['Al-Waha', 'الواحة'],
      ['Al-Qasr', 'القصر'],
      ['Jahra Industrial', 'الجهراء الصناعية'],
      ['Saad Al-Abdullah', 'سعد العبدالله'],
    ],
  },
  {
    name: 'Al Ardiya',
    hours: ALL_DAY,
    areas: [
      ['Ardiya', 'العارضية'],
      ['Firdous', 'الفردوس'],
      ['Sabah Al-Nasser', 'صباح الناصر'],
      ['Al-Rai', 'الري'],
      ['Shuwaikh Industrial', 'الشويخ الصناعية'],
      ['Farwaniya', 'الفروانية'],
      ['Sulaibiya', 'الصليبية'],
    ],
  },
  // Delivers to its own area only (client, 2 Oct).
  { name: 'Sabah Al Ahmed', hours: week('04:00', '16:00'), areas: [['Sabah Al-Ahmad', 'صباح الأحمد']] },
];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const slug = args[args.indexOf('--tenant') + 1];
if (!args.includes('--tenant') || !slug) {
  console.error('Usage: node scripts/setup-branches.mjs --tenant <slug> [--apply]');
  process.exit(1);
}

const loose = (text) => String(text || '').toLowerCase().replace(/^(al|el)[\s-]+/, '').replace(/[^a-z0-9]+/g, '');
const prisma = new PrismaClient();

try {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`No restaurant with slug "${slug}"`);
  const existing = await prisma.pickupLocation.findMany({ where: { tenantId: tenant.id } });
  console.log(`${apply ? 'APPLYING' : 'DRY RUN (add --apply to write)'} for ${tenant.nameEn} (${slug})\n`);

  for (const plan of BRANCHES) {
    const branch = existing.find((b) => loose(b.nameEn) === loose(plan.name));
    if (!branch) {
      console.log(`! Branch "${plan.name}" not found — skipped. Branches here: ${existing.map((b) => b.nameEn).join(', ')}`);
      continue;
    }
    const sample = plan.hours[0].open === plan.hours[0].close ? '24 hours' : `${plan.hours[0].open}–${plan.hours[0].close}`;
    console.log(`${branch.nameEn}: hours ${sample}, Friday break ${FRIDAY_PRAYER.from}–${FRIDAY_PRAYER.to}`);
    if (apply) await prisma.pickupLocation.update({ where: { id: branch.id }, data: { hours: plan.hours } });

    const zones = await prisma.deliveryZone.findMany({ where: { tenantId: tenant.id, branchId: branch.id } });
    for (const [nameEn, nameAr] of plan.areas) {
      const zone = zones.find((z) => loose(z.nameEn) === loose(nameEn));
      console.log(`  ${zone ? 'update' : 'add   '} ${nameEn} / ${nameAr}`);
      if (!apply) continue;
      if (zone) await prisma.deliveryZone.update({ where: { id: zone.id }, data: { nameEn, nameAr, isActive: true } });
      else await prisma.deliveryZone.create({ data: { tenantId: tenant.id, branchId: branch.id, nameEn, nameAr } });
    }
    const extra = zones.filter((z) => !plan.areas.some(([nameEn]) => loose(nameEn) === loose(z.nameEn)));
    for (const z of extra) console.log(`  keep   ${z.nameEn} (already there, not in this list)`);
    if (!plan.areas.length) console.log('  (no delivery areas yet)');
  }

  // Another branch's area with the same name would make an address ambiguous.
  const all = await prisma.deliveryZone.findMany({ where: { tenantId: tenant.id }, include: { branch: { select: { nameEn: true } } } });
  const seen = new Map();
  for (const z of all) {
    const key = loose(z.nameEn);
    if (seen.has(key) && seen.get(key) !== z.branch.nameEn) console.log(`! "${z.nameEn}" is served by both ${seen.get(key)} and ${z.branch.nameEn}`);
    seen.set(key, z.branch.nameEn);
  }
  console.log(apply ? '\nDone.' : '\nNothing written (dry run).');
} catch (error) {
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
