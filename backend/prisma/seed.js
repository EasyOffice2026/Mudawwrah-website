import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { config } from '../src/config.js';
import { DEFAULT_SETTINGS } from '../src/services/settingService.js';

const prisma = new PrismaClient();

const escapeXml = (value) =>
  value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

const wrap = (text, perLine = 18) => {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > perLine) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 4);
};

// Clearly labeled placeholder artwork; real photos are uploaded later via the admin media library.
const placeholder = async (label, slug) => {
  const filename = `placeholder-${slug}.svg`;
  const lines = wrap(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="#B00020"/>
  <rect x="24" y="24" width="552" height="552" rx="32" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>
  <text x="300" y="${300 - (lines.length - 1) * 26}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff">
    ${lines.map((l, i) => `<tspan x="300" dy="${i === 0 ? 0 : 52}">${escapeXml(l)}</tspan>`).join('')}
  </text>
  <text x="300" y="540" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" fill="#FF6B00">PLACEHOLDER IMAGE</text>
</svg>`;
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.writeFileSync(path.join(config.uploadDir, filename), svg);
  const url = `${config.publicUrl}/uploads/${filename}`;
  const existing = await prisma.media.findFirst({ where: { filename } });
  if (existing) return prisma.media.update({ where: { id: existing.id }, data: { url, thumbnailUrl: url } });
  return prisma.media.create({
    data: {
      filename,
      originalName: filename,
      mimeType: 'image/svg+xml',
      size: Buffer.byteLength(svg),
      url,
      thumbnailUrl: url,
    },
  });
};

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'item';

const sandwichExtras = [
  { groupEn: 'Extras', groupAr: 'إضافات', nameEn: 'Extra cheese', nameAr: 'جبن إضافي', extraPrice: 0.15 },
  { groupEn: 'Extras', groupAr: 'إضافات', nameEn: 'Extra veggies', nameAr: 'خضار إضافية', extraPrice: 0.1 },
  { groupEn: 'Sauce', groupAr: 'صوص', nameEn: 'Garlic sauce', nameAr: 'صوص ثوم', extraPrice: 0.1 },
  { groupEn: 'Sauce', groupAr: 'صوص', nameEn: 'Hot sauce', nameAr: 'صوص حار', extraPrice: 0.1 },
];

const boxChoices = [
  { groupEn: 'Choose your pieces', groupAr: 'اختر الأصناف', nameEn: 'Beef shawarma', nameAr: 'شاورما لحم', extraPrice: 0 },
  { groupEn: 'Choose your pieces', groupAr: 'اختر الأصناف', nameEn: 'Chicken shawarma', nameAr: 'شاورما دجاج', extraPrice: 0 },
  { groupEn: 'Choose your pieces', groupAr: 'اختر الأصناف', nameEn: 'Fajita', nameAr: 'فاهيتا', extraPrice: 0 },
  { groupEn: 'Choose your pieces', groupAr: 'اختر الأصناف', nameEn: 'Kebab', nameAr: 'كباب', extraPrice: 0 },
  { groupEn: 'Add-ons', groupAr: 'إضافات', nameEn: 'Extra fries bucket', nameAr: 'بطاطس إضافية', extraPrice: 0.75 },
];

const categories = [
  {
    nameEn: 'Picks for you 🔥',
    nameAr: 'اختيارات لك 🔥',
    slug: 'picks-for-you',
    subtitleEn: "Trending items we think you'll love",
    subtitleAr: 'أصناف رائجة نعتقد أنك ستحبها',
    displayStyle: 'grid',
    items: [
      { nameEn: 'Super MIX', nameAr: 'سوبر ميكس', price: 0.45 },
      { nameEn: 'Khalia Cinnabon', nameAr: 'خلية سينابون', price: 3.0 },
      { nameEn: 'Chicken fillet', nameAr: 'فيليه دجاج', price: 0.95 },
      { nameEn: 'Pepsi', nameAr: 'بيبسي', price: 0.2 },
      { nameEn: 'potato box', nameAr: 'بوكس بطاطس', price: 0.75 },
      { nameEn: 'TURKI', nameAr: 'تركي', price: 0.75 },
    ],
  },
  {
    nameEn: 'Sandwiches',
    nameAr: 'سندويتشات',
    slug: 'sandwiches',
    items: [
      {
        nameEn: 'Eggs with Cheese',
        nameAr: 'بيض بالجبن',
        descriptionEn: 'Fried or scrambled eggs served with melted cheese',
        descriptionAr: 'بيض مقلي أو مخفوق مع جبن ذائب',
        price: 0.5,
        isCustomizable: true,
        options: sandwichExtras,
      },
      {
        nameEn: 'Shakshuka with Cheese',
        nameAr: 'شكشوكة بالجبن',
        descriptionEn: 'Eggs cooked in a spicy tomato sauce with peppers and cheese',
        descriptionAr: 'بيض مطبوخ بصوص طماطم حار مع الفلفل والجبن',
        price: 0.55,
        isCustomizable: true,
        options: sandwichExtras,
      },
      {
        nameEn: 'Liver with Cheese',
        nameAr: 'كبدة بالجبن',
        descriptionEn: 'Sautéed liver with spices, topped with slices of cheese',
        descriptionAr: 'كبدة مقلية بالبهارات مع شرائح الجبن',
        price: 0.75,
        isCustomizable: true,
        options: sandwichExtras,
      },
      {
        nameEn: 'Halloumi',
        nameAr: 'حلوم',
        descriptionEn: 'Grilled or fried halloumi cheese served as an appetizer or snack',
        descriptionAr: 'جبن حلوم مشوي أو مقلي',
        price: 0.65,
      },
      {
        nameEn: 'Super MIX',
        nameAr: 'سوبر ميكس',
        descriptionEn: 'Falafel patties with added fillings, sauces, or extra veggies',
        descriptionAr: 'أقراص فلافل مع حشوات وصوصات وخضار إضافية',
        price: 0.45,
      },
    ],
  },
  {
    nameEn: 'Boxes',
    nameAr: 'بوكسات',
    slug: 'boxes',
    items: [
      {
        nameEn: 'Breakfast box (12 pieces)',
        nameAr: 'بوكس فطور (12 قطعة)',
        descriptionEn: '2 بيض جبن + 2 شكشوكة + 2 حلوم + 2 مكس اجبان + 2 مشكل + 2 لبنه زعتر',
        descriptionAr: '2 بيض جبن + 2 شكشوكة + 2 حلوم + 2 مكس اجبان + 2 مشكل + 2 لبنه زعتر',
        price: 6.25,
      },
      {
        nameEn: 'Dinner Box (12 pieces + potatoes) 4 items',
        nameAr: 'بوكس عشاء (12 قطعة + بطاطس) 4 أصناف',
        descriptionEn: '3 فاهيتا + 3 شاورما لحم + 3 شاورما دجاج + 3 كباب',
        descriptionAr: '3 فاهيتا + 3 شاورما لحم + 3 شاورما دجاج + 3 كباب',
        price: 7.95,
      },
      {
        nameEn: 'box mdawara of your choice (12 pieces + free fries)',
        nameAr: 'بوكس مدورة على اختيارك (12 قطعة + بطاطس مجاناً)',
        descriptionEn: 'box mdawara of your choice (12 pieces + free fries)',
        descriptionAr: 'بوكس مدورة على اختيارك (12 قطعة + بطاطس مجاناً)',
        price: 7.6,
        isCustomizable: true,
        options: boxChoices,
      },
      {
        nameEn: 'Dinner Box12 pieces + fries 6 beef burgers + 6 chicken fillet',
        nameAr: 'بوكس عشاء 12 قطعة + بطاطس 6 برجر لحم + 6 فيليه دجاج',
        descriptionEn: 'Dinner Box12 pieces + fries 6 beef burgers + 6 chicken fillet',
        descriptionAr: 'بوكس عشاء 12 قطعة + بطاطس 6 برجر لحم + 6 فيليه دجاج',
        price: 10.85,
      },
    ],
  },
  {
    nameEn: 'DRINKS',
    nameAr: 'مشروبات',
    slug: 'drinks',
    items: [
      {
        nameEn: 'Matara Karak 1L',
        nameAr: 'مطارة كرك 1 لتر',
        descriptionEn: 'Black tea, condensed milk or regular milk, sugar, spices (cardamom and cinnamon)',
        descriptionAr: 'شاي أسود، حليب مكثف أو عادي، سكر، بهارات (هيل وقرفة)',
        price: 4.5,
      },
      { nameEn: 'Karak', nameAr: 'كرك', descriptionEn: 'Karak', descriptionAr: 'كرك', price: 0.45 },
      {
        nameEn: 'Tea',
        nameAr: 'شاي',
        descriptionEn: 'Tea leaves, water, with optional sugar or milk',
        descriptionAr: 'أوراق شاي وماء مع سكر أو حليب حسب الرغبة',
        price: 0.35,
      },
      { nameEn: 'Orange Juice', nameAr: 'عصير برتقال', descriptionEn: 'ORANGE JUICE', price: 0.85 },
      { nameEn: 'Pepsi', nameAr: 'بيبسي', descriptionEn: 'Pepsi', price: 0.2 },
    ],
  },
  {
    nameEn: 'خلية مدورة',
    nameAr: 'خلية مدورة',
    slug: 'khalia-mdawara',
    items: [
      { nameEn: 'Khalia Classic', nameAr: 'خلية كلاسيك', descriptionEn: 'Khalia Classic', price: 2.5 },
      { nameEn: 'Khalia Cinnabon', nameAr: 'خلية سينابون', descriptionEn: 'Khalia Cinnabon', price: 3.0 },
      { nameEn: 'Khalia Sumo pecan', nameAr: 'خلية سومو بيكان', descriptionEn: 'Khalia Sumo pecan', price: 3.75 },
      { nameEn: 'Khalia Nutella Thyme', nameAr: 'خلية نوتيلا وزعتر', descriptionEn: 'Khalia Nutella Thyme', price: 3.5 },
      {
        nameEn: 'Khalia Kanafeh with pistachio Nutella',
        nameAr: 'خلية كنافة بالنوتيلا والبستاش',
        descriptionEn: 'Khalia Kanafeh with pistachio Nutella',
        price: 3.75,
      },
    ],
  },
];

const featured = new Set(['Super MIX', 'Khalia Cinnabon', 'Chicken fillet', 'Pepsi', 'potato box', 'TURKI']);

const main = async () => {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@mdawra.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', isActive: true },
    create: {
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      name: 'Mdawra Admin',
      role: 'ADMIN',
    },
  });

  for (const [categoryIndex, category] of categories.entries()) {
    const { items, ...categoryData } = category;
    const saved = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { ...categoryData, displayOrder: categoryIndex },
      create: { ...categoryData, displayOrder: categoryIndex },
    });

    for (const [itemIndex, item] of items.entries()) {
      const { options = [], ...itemData } = item;
      const media = await placeholder(item.nameEn, `${category.slug}-${slugify(item.nameEn)}`);
      const existing = await prisma.menuItem.findFirst({ where: { categoryId: saved.id, nameEn: item.nameEn } });
      const data = {
        ...itemData,
        categoryId: saved.id,
        imageId: media.id,
        displayOrder: itemIndex,
        isFeatured: category.slug === 'picks-for-you' || featured.has(item.nameEn),
      };
      const menuItem = existing
        ? await prisma.menuItem.update({ where: { id: existing.id }, data })
        : await prisma.menuItem.create({ data });
      await prisma.customizationOption.deleteMany({ where: { menuItemId: menuItem.id } });
      if (options.length) {
        await prisma.customizationOption.createMany({
          data: options.map((option, index) => ({ ...option, menuItemId: menuItem.id, displayOrder: index })),
        });
      }
    }
  }

  const banner = await placeholder('Mdawra promo banner', 'banner-1');
  const existingBanner = await prisma.banner.findFirst({ where: { imageId: banner.id } });
  if (!existingBanner) {
    await prisma.banner.create({
      data: { titleEn: 'Fresh from the oven', titleAr: 'طازج من الفرن', imageId: banner.id, displayOrder: 0 },
    });
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  console.log(`Seed complete. Admin login: ${adminEmail} / ${adminPassword}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
