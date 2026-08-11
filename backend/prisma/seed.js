import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_SETTINGS } from '../src/services/settingService.js';
import { put } from '../src/storage.js';

// The seed writes across every tenant, so it deliberately uses a raw client
// rather than the tenant-scoped one the API uses.
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

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'item';

// Clearly labeled placeholder artwork in each restaurant's own colours; real
// photos are uploaded later through the admin media library.
const placeholder = async (tenant, label, slug) => {
  const originalName = `placeholder-${tenant.slug}-${slug}.png`;
  const existing = await prisma.media.findFirst({ where: { tenantId: tenant.id, originalName } });
  if (existing) return existing;
  const lines = wrap(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="${tenant.brandColor}"/>
  <rect x="24" y="24" width="552" height="552" rx="32" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>
  <text x="300" y="${300 - (lines.length - 1) * 26}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff">
    ${lines.map((l, i) => `<tspan x="300" dy="${i === 0 ? 0 : 52}">${escapeXml(l)}</tspan>`).join('')}
  </text>
  <text x="300" y="540" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" fill="${tenant.accentColor}">${escapeXml(tenant.nameEn.toUpperCase())}</text>
</svg>`;
  // Rendered to PNG because Cloudinary restricts SVG delivery on new accounts.
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const stored = await put(buffer, { originalName, folder: `mdawra/${tenant.slug}` });
  return prisma.media.create({
    data: {
      tenantId: tenant.id,
      filename: stored.filename,
      originalName,
      mimeType: 'image/png',
      size: buffer.length,
      url: stored.url,
      thumbnailUrl: stored.thumbnailUrl,
    },
  });
};

// ---------------------------------------------------------------------------
// Restaurant 1 — Mdawra (shawarma & breakfast, deep red)
// ---------------------------------------------------------------------------

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

const mdawraCategories = [
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

// ---------------------------------------------------------------------------
// Restaurant 2 — Burger House (charcoal & amber)
// ---------------------------------------------------------------------------

const burgerExtras = [
  { groupEn: 'Extras', groupAr: 'إضافات', nameEn: 'Extra cheese', nameAr: 'جبن إضافي', extraPrice: 0.25 },
  { groupEn: 'Extras', groupAr: 'إضافات', nameEn: 'Extra patty', nameAr: 'قطعة لحم إضافية', extraPrice: 0.75 },
  { groupEn: 'Extras', groupAr: 'إضافات', nameEn: 'Turkey bacon', nameAr: 'بيكن ديك رومي', extraPrice: 0.4 },
  { groupEn: 'Extras', groupAr: 'إضافات', nameEn: 'Jalapeños', nameAr: 'هالبينو', extraPrice: 0.15 },
  { groupEn: 'Sauce', groupAr: 'صوص', nameEn: 'BBQ sauce', nameAr: 'صوص باربكيو', extraPrice: 0.1 },
  { groupEn: 'Sauce', groupAr: 'صوص', nameEn: 'Garlic mayo', nameAr: 'مايونيز ثوم', extraPrice: 0.1 },
  { groupEn: 'Sauce', groupAr: 'صوص', nameEn: 'Buffalo sauce', nameAr: 'صوص بافلو', extraPrice: 0.1 },
];

const burgerCategories = [
  {
    nameEn: 'Most Popular 🔥',
    nameAr: 'الأكثر طلباً 🔥',
    slug: 'most-popular',
    subtitleEn: 'What everyone is ordering this week',
    subtitleAr: 'الأكثر طلباً هذا الأسبوع',
    displayStyle: 'grid',
    items: [
      { nameEn: 'Double Smash Burger', nameAr: 'دبل سماش برجر', price: 2.5 },
      { nameEn: 'Classic Beef Burger', nameAr: 'برجر لحم كلاسيك', price: 1.75 },
      { nameEn: 'Loaded Cheese Fries', nameAr: 'بطاطس بالجبن', price: 1.5 },
      { nameEn: 'Chocolate Milkshake', nameAr: 'ميلك شيك شوكولاتة', price: 1.5 },
      { nameEn: 'Crispy Chicken Burger', nameAr: 'برجر دجاج مقرمش', price: 1.85 },
      { nameEn: 'Curly Fries', nameAr: 'بطاطس حلزونية', price: 0.95 },
    ],
  },
  {
    nameEn: 'Burgers',
    nameAr: 'برجر',
    slug: 'burgers',
    items: [
      {
        nameEn: 'Classic Beef Burger',
        nameAr: 'برجر لحم كلاسيك',
        descriptionEn: 'Chargrilled beef patty, lettuce, tomato, pickles and house sauce',
        descriptionAr: 'قطعة لحم مشوية مع خس وطماطم ومخلل وصوص البيت',
        price: 1.75,
        isCustomizable: true,
        options: burgerExtras,
      },
      {
        nameEn: 'Double Smash Burger',
        nameAr: 'دبل سماش برجر',
        descriptionEn: 'Two smashed patties with double American cheese and grilled onions',
        descriptionAr: 'قطعتان مسحوقتان مع جبن أمريكي مضاعف وبصل مشوي',
        price: 2.5,
        isCustomizable: true,
        options: burgerExtras,
      },
      {
        nameEn: 'Crispy Chicken Burger',
        nameAr: 'برجر دجاج مقرمش',
        descriptionEn: 'Buttermilk fried chicken breast with coleslaw and garlic mayo',
        descriptionAr: 'صدر دجاج مقلي مع كول سلو ومايونيز الثوم',
        price: 1.85,
        isCustomizable: true,
        options: burgerExtras,
      },
      {
        nameEn: 'Spicy Jalapeño Burger',
        nameAr: 'برجر هالبينو حار',
        descriptionEn: 'Beef patty, pepper jack cheese, jalapeños and chipotle sauce',
        descriptionAr: 'لحم مع جبن حار وهالبينو وصوص تشيبوتلي',
        price: 2.1,
        isCustomizable: true,
        options: burgerExtras,
      },
      {
        nameEn: 'Mushroom Swiss Burger',
        nameAr: 'برجر مشروم وسويسري',
        descriptionEn: 'Sautéed mushrooms and melted Swiss cheese on a beef patty',
        descriptionAr: 'مشروم سوتيه وجبن سويسري ذائب فوق قطعة لحم',
        price: 2.25,
      },
      {
        nameEn: 'Veggie Burger',
        nameAr: 'برجر نباتي',
        descriptionEn: 'Grilled halloumi and portobello with roasted pepper',
        descriptionAr: 'حلوم مشوي وفطر بورتوبيللو مع فلفل مشوي',
        price: 1.5,
      },
    ],
  },
  {
    nameEn: 'Sides',
    nameAr: 'المقبلات',
    slug: 'sides',
    items: [
      { nameEn: 'French Fries', nameAr: 'بطاطس مقلية', descriptionEn: 'Crispy golden fries with sea salt', price: 0.75 },
      { nameEn: 'Curly Fries', nameAr: 'بطاطس حلزونية', descriptionEn: 'Seasoned curly fries', price: 0.95 },
      { nameEn: 'Onion Rings', nameAr: 'حلقات بصل', descriptionEn: 'Beer-battered onion rings', price: 0.85 },
      {
        nameEn: 'Loaded Cheese Fries',
        nameAr: 'بطاطس بالجبن',
        descriptionEn: 'Fries smothered in cheese sauce and spring onion',
        descriptionAr: 'بطاطس مغطاة بصوص الجبن والبصل الأخضر',
        price: 1.5,
      },
      { nameEn: 'Coleslaw', nameAr: 'كول سلو', descriptionEn: 'Fresh cabbage and carrot slaw', price: 0.5 },
    ],
  },
  {
    nameEn: 'Shakes & Drinks',
    nameAr: 'مشروبات وميلك شيك',
    slug: 'shakes-drinks',
    items: [
      { nameEn: 'Chocolate Milkshake', nameAr: 'ميلك شيك شوكولاتة', descriptionEn: 'Thick chocolate shake', price: 1.5 },
      { nameEn: 'Vanilla Milkshake', nameAr: 'ميلك شيك فانيلا', descriptionEn: 'Madagascar vanilla shake', price: 1.5 },
      { nameEn: 'Strawberry Milkshake', nameAr: 'ميلك شيك فراولة', descriptionEn: 'Fresh strawberry shake', price: 1.5 },
      { nameEn: 'Pepsi', nameAr: 'بيبسي', descriptionEn: 'Chilled can', price: 0.25 },
      { nameEn: 'Still Water', nameAr: 'ماء', descriptionEn: '500ml bottle', price: 0.15 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Restaurant 3 — Café Mocha (coffee brown & gold)
// ---------------------------------------------------------------------------

const coffeeOptions = [
  { groupEn: 'Milk', groupAr: 'الحليب', nameEn: 'Full fat milk', nameAr: 'حليب كامل الدسم', extraPrice: 0 },
  { groupEn: 'Milk', groupAr: 'الحليب', nameEn: 'Skimmed milk', nameAr: 'حليب خالي الدسم', extraPrice: 0 },
  { groupEn: 'Milk', groupAr: 'الحليب', nameEn: 'Oat milk', nameAr: 'حليب الشوفان', extraPrice: 0.25 },
  { groupEn: 'Milk', groupAr: 'الحليب', nameEn: 'Almond milk', nameAr: 'حليب اللوز', extraPrice: 0.25 },
  { groupEn: 'Extras', groupAr: 'إضافات', nameEn: 'Extra shot', nameAr: 'جرعة إضافية', extraPrice: 0.3 },
  { groupEn: 'Extras', groupAr: 'إضافات', nameEn: 'Vanilla syrup', nameAr: 'شراب الفانيلا', extraPrice: 0.15 },
  { groupEn: 'Extras', groupAr: 'إضافات', nameEn: 'Caramel syrup', nameAr: 'شراب الكراميل', extraPrice: 0.15 },
];

const cafeCategories = [
  {
    nameEn: 'Favourites ☕',
    nameAr: 'المفضلة ☕',
    slug: 'favourites',
    subtitleEn: 'Our most loved cups and bakes',
    subtitleAr: 'الأكثر حباً لدى زبائننا',
    displayStyle: 'grid',
    items: [
      { nameEn: 'Spanish Latte', nameAr: 'سبانيش لاتيه', price: 1.6 },
      { nameEn: 'Iced Spanish Latte', nameAr: 'آيس سبانيش لاتيه', price: 1.75 },
      { nameEn: 'Almond Croissant', nameAr: 'كرواسون اللوز', price: 1.25 },
      { nameEn: 'Cold Brew', nameAr: 'كولد برو', price: 1.8 },
      { nameEn: 'Cinnamon Roll', nameAr: 'سينامون رول', price: 1.1 },
      { nameEn: 'Cappuccino', nameAr: 'كابتشينو', price: 1.4 },
    ],
  },
  {
    nameEn: 'Hot Coffee',
    nameAr: 'قهوة ساخنة',
    slug: 'hot-coffee',
    items: [
      { nameEn: 'Espresso', nameAr: 'إسبريسو', descriptionEn: 'Double shot of our house blend', descriptionAr: 'جرعة مزدوجة من خلطة البيت', price: 0.9 },
      {
        nameEn: 'Cappuccino',
        nameAr: 'كابتشينو',
        descriptionEn: 'Espresso with steamed milk and a thick foam cap',
        descriptionAr: 'إسبريسو مع حليب مبخر ورغوة كثيفة',
        price: 1.4,
        isCustomizable: true,
        options: coffeeOptions,
      },
      {
        nameEn: 'Flat White',
        nameAr: 'فلات وايت',
        descriptionEn: 'Ristretto shots with velvety microfoam',
        descriptionAr: 'ريستريتو مع رغوة حريرية',
        price: 1.5,
        isCustomizable: true,
        options: coffeeOptions,
      },
      {
        nameEn: 'Café Latte',
        nameAr: 'كافيه لاتيه',
        descriptionEn: 'Smooth espresso with steamed milk',
        descriptionAr: 'إسبريسو ناعم مع حليب مبخر',
        price: 1.45,
        isCustomizable: true,
        options: coffeeOptions,
      },
      {
        nameEn: 'Spanish Latte',
        nameAr: 'سبانيش لاتيه',
        descriptionEn: 'Espresso, condensed milk and steamed milk',
        descriptionAr: 'إسبريسو وحليب مكثف وحليب مبخر',
        price: 1.6,
        isCustomizable: true,
        options: coffeeOptions,
      },
      { nameEn: 'Hot Chocolate', nameAr: 'شوكولاتة ساخنة', descriptionEn: 'Belgian chocolate with steamed milk', price: 1.5 },
    ],
  },
  {
    nameEn: 'Cold Coffee',
    nameAr: 'قهوة باردة',
    slug: 'cold-coffee',
    items: [
      {
        nameEn: 'Iced Latte',
        nameAr: 'آيس لاتيه',
        descriptionEn: 'Chilled espresso over milk and ice',
        descriptionAr: 'إسبريسو بارد مع حليب وثلج',
        price: 1.6,
        isCustomizable: true,
        options: coffeeOptions,
      },
      {
        nameEn: 'Iced Spanish Latte',
        nameAr: 'آيس سبانيش لاتيه',
        descriptionEn: 'Our signature sweet iced latte',
        descriptionAr: 'اللاتيه المثلج المميز لدينا',
        price: 1.75,
        isCustomizable: true,
        options: coffeeOptions,
      },
      { nameEn: 'Cold Brew', nameAr: 'كولد برو', descriptionEn: 'Steeped for 18 hours, served black', descriptionAr: 'منقوع 18 ساعة ويقدم سادة', price: 1.8 },
      {
        nameEn: 'Iced Caramel Macchiato',
        nameAr: 'آيس كراميل ماكياتو',
        descriptionEn: 'Vanilla milk, espresso and caramel drizzle',
        descriptionAr: 'حليب الفانيلا وإسبريسو وكراميل',
        price: 1.9,
        isCustomizable: true,
        options: coffeeOptions,
      },
      { nameEn: 'Affogato', nameAr: 'أفوجاتو', descriptionEn: 'Vanilla gelato drowned in hot espresso', price: 1.7 },
    ],
  },
  {
    nameEn: 'Bakery',
    nameAr: 'المخبوزات',
    slug: 'bakery',
    items: [
      { nameEn: 'Butter Croissant', nameAr: 'كرواسون بالزبدة', descriptionEn: 'Baked fresh every morning', descriptionAr: 'يخبز طازجاً كل صباح', price: 0.95 },
      { nameEn: 'Almond Croissant', nameAr: 'كرواسون اللوز', descriptionEn: 'Filled with almond cream and toasted flakes', price: 1.25 },
      { nameEn: 'Cinnamon Roll', nameAr: 'سينامون رول', descriptionEn: 'Warm roll with cream cheese glaze', price: 1.1 },
      { nameEn: 'Blueberry Muffin', nameAr: 'مافن التوت', descriptionEn: 'Packed with wild blueberries', price: 1.0 },
      { nameEn: 'Cheesecake Slice', nameAr: 'قطعة تشيز كيك', descriptionEn: 'New York style with berry compote', price: 1.65 },
      { nameEn: 'Date Cake', nameAr: 'كيكة التمر', descriptionEn: 'Sticky date sponge with toffee sauce', descriptionAr: 'كيكة التمر مع صوص التوفي', price: 1.2 },
    ],
  },
];

// ---------------------------------------------------------------------------

const RESTAURANTS = [
  {
    tenant: {
      slug: 'mdawra',
      nameEn: 'Mdawra',
      nameAr: 'مدورة',
      taglineEn: 'Shawarma, breakfast boxes & karak',
      taglineAr: 'شاورما وبوكسات فطور وكرك',
      cuisineEn: 'Kuwaiti · Breakfast',
      cuisineAr: 'كويتي · فطور',
      brandColor: '#B00020',
      brandDark: '#8A0019',
      brandLight: '#F6E4E7',
      accentColor: '#FF6B00',
    },
    adminEmail: 'admin@mdawra.com',
    adminName: 'Mdawra Admin',
    settings: {
      contactPhone: '+965 2222 1100',
      whatsappNumber: '96522221100',
      address: 'Salmiya, Block 12, Kuwait',
      workingHours: '07:00 - 23:30',
      deliveryFee: '1.000',
      minimumOrder: '2.000',
    },
    bannerEn: 'Fresh from the oven',
    bannerAr: 'طازج من الفرن',
    categories: mdawraCategories,
    featured: ['Super MIX', 'Khalia Cinnabon', 'Chicken fillet', 'Pepsi', 'potato box', 'TURKI'],
  },
  {
    tenant: {
      slug: 'burger-house',
      nameEn: 'Burger House',
      nameAr: 'برجر هاوس',
      taglineEn: 'Smashed patties & thick shakes',
      taglineAr: 'برجر مسحوق وميلك شيك كثيف',
      cuisineEn: 'American · Burgers',
      cuisineAr: 'أمريكي · برجر',
      brandColor: '#1F2937',
      brandDark: '#111827',
      brandLight: '#E5E7EB',
      accentColor: '#F59E0B',
    },
    adminEmail: 'admin@burgerhouse.com',
    adminName: 'Burger House Admin',
    settings: {
      contactPhone: '+965 2233 4455',
      whatsappNumber: '96522334455',
      address: 'Kuwait City, Al Soor Street',
      workingHours: '12:00 - 02:00',
      deliveryFee: '1.250',
      minimumOrder: '3.000',
      serviceChargePercent: '5',
    },
    bannerEn: 'Double patty week — 20% off',
    bannerAr: 'أسبوع الدبل برجر — خصم ٢٠٪',
    categories: burgerCategories,
    featured: [
      'Double Smash Burger',
      'Classic Beef Burger',
      'Loaded Cheese Fries',
      'Chocolate Milkshake',
      'Crispy Chicken Burger',
      'Curly Fries',
    ],
  },
  {
    tenant: {
      slug: 'cafe-mocha',
      nameEn: 'Café Mocha',
      nameAr: 'كافيه موكا',
      taglineEn: 'Specialty coffee & fresh bakes',
      taglineAr: 'قهوة مختصة ومخبوزات طازجة',
      cuisineEn: 'Café · Bakery',
      cuisineAr: 'كافيه · مخبوزات',
      brandColor: '#6F4E37',
      brandDark: '#533A29',
      brandLight: '#F0E6DC',
      accentColor: '#C8A165',
    },
    adminEmail: 'admin@cafemocha.com',
    adminName: 'Café Mocha Admin',
    settings: {
      contactPhone: '+965 2244 8899',
      whatsappNumber: '96522448899',
      address: 'Jabriya, Block 3, Kuwait',
      workingHours: '06:30 - 23:00',
      deliveryFee: '0.750',
      minimumOrder: '1.500',
    },
    bannerEn: 'Try our new cold brew',
    bannerAr: 'جرب الكولد برو الجديد',
    categories: cafeCategories,
    featured: ['Spanish Latte', 'Iced Spanish Latte', 'Almond Croissant', 'Cold Brew', 'Cinnamon Roll', 'Cappuccino'],
  },
];

const seedRestaurant = async (definition, password) => {
  const tenant = await prisma.tenant.upsert({
    where: { slug: definition.tenant.slug },
    update: definition.tenant,
    create: definition.tenant,
  });

  await prisma.user.upsert({
    where: { email: definition.adminEmail },
    update: { tenantId: tenant.id, role: 'ADMIN', isActive: true },
    create: {
      tenantId: tenant.id,
      email: definition.adminEmail,
      password: await bcrypt.hash(password, 10),
      name: definition.adminName,
      role: 'ADMIN',
    },
  });

  const featured = new Set(definition.featured || []);

  for (const [categoryIndex, category] of definition.categories.entries()) {
    const { items, ...categoryData } = category;
    const saved = await prisma.category.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: category.slug } },
      update: { ...categoryData, displayOrder: categoryIndex },
      create: { ...categoryData, tenantId: tenant.id, displayOrder: categoryIndex },
    });

    for (const [itemIndex, item] of items.entries()) {
      const { options = [], ...itemData } = item;
      const media = await placeholder(tenant, item.nameEn, `${category.slug}-${slugify(item.nameEn)}`);
      const existing = await prisma.menuItem.findFirst({
        where: { tenantId: tenant.id, categoryId: saved.id, nameEn: item.nameEn },
      });
      const data = {
        ...itemData,
        tenantId: tenant.id,
        categoryId: saved.id,
        imageId: media.id,
        displayOrder: itemIndex,
        isFeatured: categoryIndex === 0 || featured.has(item.nameEn),
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

  const bannerMedia = await placeholder(tenant, definition.bannerEn, 'banner-1');
  const existingBanner = await prisma.banner.findFirst({ where: { tenantId: tenant.id, imageId: bannerMedia.id } });
  if (!existingBanner) {
    await prisma.banner.create({
      data: {
        tenantId: tenant.id,
        titleEn: definition.bannerEn,
        titleAr: definition.bannerAr,
        imageId: bannerMedia.id,
        displayOrder: 0,
      },
    });
  }

  const settings = { ...DEFAULT_SETTINGS, ...definition.settings };
  settings.restaurantNameEn = definition.tenant.nameEn;
  settings.restaurantNameAr = definition.tenant.nameAr;
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      update: {},
      create: { tenantId: tenant.id, key, value: String(value) },
    });
  }

  const itemCount = await prisma.menuItem.count({ where: { tenantId: tenant.id } });
  console.log(`  ${definition.tenant.nameEn.padEnd(14)} /r/${tenant.slug.padEnd(14)} ${itemCount} items   ${definition.adminEmail}`);
};

const main = async () => {
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  const ownerEmail = process.env.SEED_OWNER_EMAIL || 'owner@platform.com';

  // The reseller: no tenantId, so this account can administer every restaurant.
  await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { tenantId: null, role: 'ADMIN', isActive: true },
    create: {
      email: ownerEmail,
      password: await bcrypt.hash(password, 10),
      name: 'Platform Owner',
      role: 'ADMIN',
    },
  });

  console.log('Seeding restaurants:');
  for (const definition of RESTAURANTS) {
    await seedRestaurant(definition, password);
  }

  console.log(`\nPlatform owner (all restaurants): ${ownerEmail}`);
  console.log(`Password for every demo account:  ${password}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
