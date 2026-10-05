// Applies the restaurant's branch setup: opening hours (with the Friday prayer
// break) and the delivery areas each branch serves. Safe to run again: hours are
// overwritten, areas are added or updated by name, nothing is deleted.
//
//   node scripts/setup-branches.mjs --tenant mdawra            dry run: prints the plan, writes nothing
//   node scripts/setup-branches.mjs --tenant mdawra --apply    writes it
//
// Fee and minimum stay empty on every area, so the Settings values apply
// (1.000 KWD / 2.000 KWD, the same everywhere per the client).
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const FRIDAY_PRAYER = { from: '11:00', to: '12:00' };
const week = (open, close) =>
  Array.from({ length: 7 }, (_, day) => ({ day, open, close, closed: false, breaks: day === 5 ? [FRIDAY_PRAYER] : [] }));
const ALL_DAY = week('00:00', '00:00');

// Areas from the client's sheet "Modawarah-Delivery Areas Branches.xlsx" (3 Oct):
// 52 + 39 + 23 + 1 = 115, plus Ardiya itself (4 Oct), minus Sabah Al-Ahmad under Aqeelah (5 Oct) = 115. Arabic spellings tidied (e.g. محفظة → محافظة, الصيبية → الصبية).
// Branch Arabic names and addresses are filled only where empty or saved as "???".
// One dashboard login per branch (client, 5 Oct): created once with a random password that is
// printed here and nowhere else; an existing login is left alone.
// Static IPs (client, 4 Oct) replace the branch list when given.
const BRANCHES = [
  {
    name: 'Al Ardiya',
    login: 'ardiya@madawarah.com',
    allowedIps: ['188.71.216.23'],
    nameAr: 'العارضية',
    addressEn: 'Al-Ardiya Industrial – 5th Ring Road – Next to Shawarma Factory',
    addressAr: 'العارضية الصناعية – على الدائري الخامس – بجوار شاورما فاكتوري',
    hours: ALL_DAY,
    areas: [
      ['Ardiya', 'العارضية'],
      ['Riggae', 'الرقعي'],
      ['Abdullah Al-Mubarak', 'عبدالله المبارك'],
      ['Al-Rai', 'الري'],
      ['Andalous', 'الأندلس'],
      ['Rihab', 'الرحاب'],
      ['Firdous', 'الفردوس'],
      ['Sabah Al-Nasser', 'صباح الناصر'],
      ['Sulaibiya', 'الصليبية'],
      ['Gharnata', 'غرناطة'],
      ['Ministries Area', 'منطقة الوزارات'],
      ['Sulaibikhat', 'الصليبيخات'],
      ['Farwaniya', 'الفروانية'],
      ['Shuwaikh Residential', 'الشويخ السكنية'],
      ['Shuwaikh Industrial', 'الشويخ الصناعية'],
      ['Shuwaikh Health', 'الشويخ الصحية'],
      ['Jleeb Al-Shuyoukh', 'جليب الشيوخ'],
      ['Mansouriya', 'المنصورية'],
      ['Salmiya', 'السالمية'],
      ['Bayan', 'بيان'],
      ['Hawally', 'حولي'],
      ['Bneid Al-Qar', 'بنيد القار'],
      ['Khaldiya', 'الخالدية'],
      ['Salhiya', 'الصالحية'],
      ['West Abdullah Al-Mubarak', 'غرب عبدالله المبارك'],
      ['South Abdullah Al-Mubarak', 'جنوب عبدالله المبارك'],
      ['Faiha', 'الفيحاء'],
      ['Siddiq', 'الصديق'],
      ['Nuzha', 'النزهة'],
      ['Nahda', 'النهضة'],
      ['Dajeej', 'الضجيج'],
      ['Qairawan', 'القيروان'],
      ['Rawda', 'الروضة'],
      ['Ishbiliya', 'إشبيلية'],
      ['Kaifan', 'كيفان'],
      ['Qurtuba', 'قرطبة'],
      ['Omariya', 'العمرية'],
      ['Northwest Sulaibikhat', 'شمال غرب الصليبيخات'],
      ['Shuhada', 'الشهداء'],
      ['Hateen', 'حطين'],
      ['Shaab', 'الشعب'],
      ['Rabiya', 'الرابية'],
      ['Khaitan', 'خيطان'],
      ['South Surra', 'جنوب السرة'],
      ['Jabriya', 'الجابرية'],
      ['Salam', 'السلام'],
      ['Capital', 'العاصمة'],
      ['Airport', 'المطار'],
      ['Rumaithiya', 'الرميثية'],
      ['Zahra', 'الزهراء'],
      ['Qadsiya', 'القادسية'],
      ['Qibla', 'القبلة'],
      ['Sharq', 'شرق'],
    ],
  },
  {
    name: 'Al Aqeelah',
    login: 'aqeelah@madawarah.com',
    allowedIps: ['188.71.248.76'],
    nameAr: 'العقيلة',
    addressEn: 'Wadha Complex, beside Sama Mall',
    addressAr: 'مجمع وضحة بجانب سما مول',
    hours: ALL_DAY,
    areas: [
      ['Egaila', 'العقيلة'],
      ['Riqqah', 'الرقة'],
      ['Fahd Al-Ahmad', 'فهد الأحمد'],
      ['Mahboula', 'المهبولة'],
      ['Hadiya', 'هدية'],
      ['Abu Halifa', 'أبو حليفة'],
      ['Sabahiya', 'الصباحية'],
      ['Mangaf', 'المنقف'],
      ['Fahaheel', 'الفحيحيل'],
      ['Fintas', 'الفنطاس'],
      ['Daher', 'الظهر'],
      ['Jaber Al-Ali', 'جابر العلي'],
      ['North Ahmadi', 'شمال الأحمدي'],
      ['Ahmadi', 'الأحمدي'],
      ['Qusour', 'القصور'],
      ['Adan', 'العدان'],
      ['West Mishref', 'غرب مشرف'],
      ['Abu Fatira', 'أبو فطيرة'],
      ['Messila', 'المسيلة'],
      ['Fnaitees', 'الفنيطيس'],
      ['Umm Al-Haiman', 'أم الهيمان'],
      ['Sabah Al-Salem', 'صباح السالم'],
      ['Ali Sabah Al-Salem', 'علي صباح السالم'],
      ['Mina Abdullah', 'ميناء عبدالله'],
      ['Mina Abdullah Chalets', 'شاليهات ميناء عبدالله'],
      ['Hateen', 'حطين'],
      ['Al-Masayel', 'المسايل'],
      ['South Ahmadi', 'جنوب الأحمدي'],
      ['East Ahmadi', 'شرق الأحمدي'],
      ['South Sabahiya', 'جنوب الصباحية'],
      ['Mubarak Al-Kabeer', 'مبارك الكبير'],
      ['Surra', 'السرة'],
      ['Qadsiya', 'القادسية'],
      ['Subhan', 'صبحان'],
      ['Qurain', 'القرين'],
      ['Mishref', 'مشرف'],
      ['Salwa', 'سلوى'],
      ['Ahmadi Stables', 'إسطبلات الأحمدي'],
    ],
  },
  {
    name: 'Al Jahra',
    login: 'jahra@madawarah.com',
    allowedIps: ['37.231.157.252'],
    nameAr: 'الجهراء',
    addressEn: 'Al-Dana Complex, outside street after Shaker Shawarma',
    addressAr: 'مجمع الدانا، الشارع من برا بعد شاورما شاكر',
    hours: ALL_DAY,
    areas: [
      ['Naeem', 'النعيم'],
      ['Jahra Governorate', 'محافظة الجهراء'],
      ['Naseem', 'النسيم'],
      ['Al-Qasr', 'القصر'],
      ['Taima', 'تيماء'],
      ['Old Jahra', 'الجهراء القديمة'],
      ['Jahra Industrial', 'الجهراء الصناعية'],
      ['Oyoun', 'العيون'],
      ['Al-Waha', 'الواحة'],
      ['Othman Plots', 'قسائم العثمان'],
      ['Saad Al-Abdullah', 'سعد العبدالله'],
      ['Amghara', 'أمغرة'],
      ['Jaber Al-Ahmad', 'جابر الأحمد'],
      ['Doha', 'الدوحة'],
      ['Mutlaa', 'المطلاع'],
      ['Jahra Stables', 'إسطبلات الجهراء'],
      ['Riggae', 'الرقعي'],
      ['Farwaniya', 'الفروانية'],
      ['Kabd', 'كبد'],
      ['East Taima', 'شرق تيماء'],
      ['West Doha', 'الدوحة الغربية'],
      ['Sabbiya', 'الصبية'],
      ['Doha Port', 'ميناء الدوحة'],
    ],
  },
  {
    // All of Sabah Al-Ahmad City: blocks A–E, residential and government plots.
    name: 'Sabah Al Ahmed',
    login: 'sabahalahmad@madawarah.com',
    allowedIps: ['188.71.233.10'],
    nameAr: 'صباح الأحمد',
    addressEn: 'Sabah Al-Ahmad City Cooperative Society – B2',
    addressAr: 'جمعية مدينة صباح الأحمد التعاونية – قطاع B2',
    hours: week('04:00', '16:00'),
    areas: [['Sabah Al-Ahmad', 'صباح الأحمد']],
  },
];

// Areas the sheet lists under two branches: [first choice, cover when it is closed].
// The client confirmed Al Ardiya for these (5 Oct); the backup only matters if it is closed.
// Sabah Al-Ahmad is served by its own branch only: Al Aqeelah is too far (client, 5 Oct).
const SHARED = {
  Riggae: ['Al Ardiya', 'Al Jahra'],
  Farwaniya: ['Al Ardiya', 'Al Jahra'],
  Qadsiya: ['Al Ardiya', 'Al Aqeelah'],
  Hateen: ['Al Ardiya', 'Al Aqeelah'],
};

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
    const blank = (text) => !text || /^[?\s]+$/.test(text);
    const details = { hours: plan.hours };
    if (plan.allowedIps) {
      details.allowedIps = plan.allowedIps;
      console.log(`  ips    ${plan.allowedIps.join(', ')}`);
    }
    for (const key of ['nameAr', 'addressEn', 'addressAr']) {
      if (blank(branch[key]) && plan[key]) {
        details[key] = plan[key];
        console.log(`  set    ${key}: ${plan[key]}`);
      }
    }
    if (apply) await prisma.pickupLocation.update({ where: { id: branch.id }, data: details });

    if (plan.login) {
      // Emails are unique across every restaurant, so this lookup is not tenant-scoped.
      const user = await prisma.user.findUnique({ where: { email: plan.login } });
      if (user) {
        console.log(`  login  ${plan.login} already exists — left as it is`);
      } else if (apply) {
        const password = randomBytes(9).toString('base64url');
        await prisma.user.create({
          data: { tenantId: tenant.id, email: plan.login, password: await bcrypt.hash(password, 10), name: `${branch.nameEn} branch`, role: 'BRANCH', branchId: branch.id },
        });
        console.log(`  login  ${plan.login}  password: ${password}  (shown once — pass it to the branch)`);
      } else {
        console.log(`  login  ${plan.login} will be created`);
      }
    }

    const zones = await prisma.deliveryZone.findMany({ where: { tenantId: tenant.id, branchId: branch.id } });
    for (const [nameEn, nameAr] of plan.areas) {
      const zone = zones.find((z) => loose(z.nameEn) === loose(nameEn));
      const shared = SHARED[nameEn];
      const displayOrder = shared && loose(shared[0]) !== loose(plan.name) ? 1 : 0;
      const note = !shared ? '' : displayOrder ? `  (covers when ${shared[0]} is closed)` : '  (first choice)';
      console.log(`  ${zone ? 'update' : 'add   '} ${nameEn} / ${nameAr}${note}`);
      if (!apply) continue;
      const data = { nameEn, nameAr, isActive: true, displayOrder };
      if (zone) await prisma.deliveryZone.update({ where: { id: zone.id }, data });
      else await prisma.deliveryZone.create({ data: { tenantId: tenant.id, branchId: branch.id, ...data } });
    }
    const extra = zones.filter((z) => !plan.areas.some(([nameEn]) => loose(nameEn) === loose(z.nameEn)));
    for (const z of extra) console.log(`  keep   ${z.nameEn} (already there, not in this list)`);
    if (!plan.areas.length) console.log('  (no delivery areas yet)');
  }

  // An area under two branches is fine when planned (SHARED); anything else is worth a look.
  const all = await prisma.deliveryZone.findMany({ where: { tenantId: tenant.id }, include: { branch: { select: { nameEn: true } } } });
  const seen = new Map();
  for (const z of all) {
    const key = loose(z.nameEn);
    const planned = Object.keys(SHARED).some((name) => loose(name) === key);
    if (seen.has(key) && seen.get(key) !== z.branch.nameEn && !planned) console.log(`! "${z.nameEn}" is served by both ${seen.get(key)} and ${z.branch.nameEn}`);
    seen.set(key, z.branch.nameEn);
  }
  console.log(apply ? '\nDone.' : '\nNothing written (dry run).');
} catch (error) {
  console.error(`Setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
