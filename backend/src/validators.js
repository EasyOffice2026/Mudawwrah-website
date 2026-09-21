import { z } from 'zod';

const price = z.coerce.number().min(0);
const optionalString = z.string().trim().optional().nullable();

// A utm value is whatever was in the query string, so it is capped and trimmed
// before it can reach the database or the admin order list.
const attribution = z.string().trim().max(200).nullable().optional();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const categorySchema = z.object({
  nameEn: z.string().trim().min(1),
  nameAr: z.string().trim().min(1),
  slug: optionalString,
  subtitleEn: optionalString,
  subtitleAr: optionalString,
  displayStyle: z.enum(['list', 'grid']).optional(),
  displayOrder: z.coerce.number().int().optional(),
  isVisible: z.coerce.boolean().optional(),
});

export const categoryUpdateSchema = categorySchema.partial();

export const customizationOptionSchema = z.object({
  groupEn: z.string().trim().min(1),
  groupAr: optionalString,
  nameEn: z.string().trim().min(1),
  nameAr: optionalString,
  extraPrice: price.optional(),
  compareAtExtraPrice: z.coerce.number().min(0).nullable().optional(),
  imageId: z.string().uuid().nullable().optional(),
  isRequired: z.coerce.boolean().optional(),
  maxSelect: z.coerce.number().int().min(1).optional(),
  displayOrder: z.coerce.number().int().optional(),
});

export const itemSchema = z.object({
  nameEn: z.string().trim().min(1),
  nameAr: optionalString,
  descriptionEn: optionalString,
  descriptionAr: optionalString,
  price,
  compareAtPrice: z.coerce.number().min(0).nullable().optional(),
  categoryId: z.string().uuid(),
  imageId: z.string().uuid().optional().nullable(),
  isAvailable: z.coerce.boolean().optional(),
  isOutOfStock: z.coerce.boolean().optional(),
  isFeatured: z.coerce.boolean().optional(),
  isTopRated: z.coerce.boolean().optional(),
  isCustomizable: z.coerce.boolean().optional(),
  calories: z.coerce.number().int().min(0).nullable().optional(),
  protein: z.coerce.number().int().min(0).nullable().optional(),
  fat: z.coerce.number().int().min(0).nullable().optional(),
  carbs: z.coerce.number().int().min(0).nullable().optional(),
  displayOrder: z.coerce.number().int().optional(),
  options: z.array(customizationOptionSchema).optional(),
});

export const itemUpdateSchema = itemSchema.partial();

export const reorderSchema = z.object({ orderedIds: z.array(z.string().uuid()).min(1) });

export const bulkAvailabilitySchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  isAvailable: z.coerce.boolean(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8, 'Use at least 8 characters'),
  phone: optionalString,
});

export const orderSchema = z.object({
  customerName: z.string().trim().min(1),
  customerPhone: z.string().trim().min(6),
  address: optionalString,
  notes: optionalString,
  paymentMethod: z.enum(['CASH', 'KNET', 'CARD', 'APPLE_PAY', 'WHATSAPP']).optional(),
  orderType: z.enum(['DELIVERY', 'PICKUP']).optional(),
  // Only the code travels; the discount itself is resolved server-side.
  promoCode: optionalString,
  tip: z.coerce.number().min(0).optional(),
  cutlery: z.coerce.boolean().optional(),
  deliveryNote: optionalString,
  /// Where the customer dropped the pin on the checkout map. What a rider
  /// actually navigates to, as opposed to the typed address fields below,
  /// which are hand-entered and can be wrong or incomplete.
  deliveryLat: z.coerce.number().min(-90).max(90).nullable().optional(),
  deliveryLng: z.coerce.number().min(-180).max(180).nullable().optional(),
  /// Branch to collect from, when this is a pickup order.
  pickupLocationId: z.string().uuid().nullable().optional(),
  // Marketing attribution, forwarded by the storefront from the link the
  // customer arrived on. Length-capped because it lands in the admin's order
  // list: these are attacker-controlled strings from a URL, not our own data.
  utmSource: attribution,
  utmMedium: attribution,
  utmCampaign: attribution,
  utmTerm: attribution,
  utmContent: attribution,
  referrer: z.string().trim().max(500).nullable().optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1),
        optionIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .min(1),
});

/** One weekday's collection window. Day 0 is Sunday, matching Date#getDay. */
const openingHours = z.object({
  day: z.coerce.number().int().min(0).max(6),
  open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time like 09:00'),
  close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time like 23:00'),
  closed: z.coerce.boolean().optional(),
});

export const pickupLocationSchema = z.object({
  nameEn: z.string().trim().min(1),
  nameAr: optionalString,
  addressEn: optionalString,
  addressAr: optionalString,
  directionsEn: optionalString,
  directionsAr: optionalString,
  phone: optionalString,
  hours: z.array(openingHours).max(7).optional(),
  prepMinutes: z.coerce.number().int().min(0).max(600).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const pickupLocationUpdateSchema = pickupLocationSchema.partial();

export const promoPreviewSchema = z.object({
  code: z.string().trim().min(1),
  subtotal: z.coerce.number().min(0),
});

export const promotionSchema = z.object({
  code: z.string().trim().min(1),
  titleEn: z.string().trim().min(1),
  titleAr: optionalString,
  subtitleEn: optionalString,
  subtitleAr: optionalString,
  type: z.enum(['PERCENT', 'FIXED', 'FREE_DELIVERY']).optional(),
  value: z.coerce.number().min(0).optional(),
  minOrder: z.coerce.number().min(0).optional(),
  maxDiscount: z.coerce.number().min(0).nullable().optional(),
  isActive: z.coerce.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']),
});

export const bannerSchema = z.object({
  titleEn: optionalString,
  titleAr: optionalString,
  imageId: z.string().uuid().optional().nullable(),
  linkUrl: optionalString,
  displayOrder: z.coerce.number().int().optional(),
  isActive: z.coerce.boolean().optional(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
});

export const bannerUpdateSchema = bannerSchema.partial();

export const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().trim().min(1),
  phone: optionalString,
  role: z.enum(['ADMIN', 'STAFF', 'CUSTOMER']).optional(),
  isActive: z.coerce.boolean().optional(),
});

export const userUpdateSchema = userSchema.partial();

export const settingsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex colour like #B00020');

export const tenantSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Use lowercase letters, numbers and dashes'),
  nameEn: z.string().trim().min(1),
  nameAr: z.string().trim().min(1),
  taglineEn: optionalString,
  taglineAr: optionalString,
  cuisineEn: optionalString,
  cuisineAr: optionalString,
  brandColor: hexColor.optional(),
  brandDark: hexColor.optional(),
  brandLight: hexColor.optional(),
  accentColor: hexColor.optional(),
  currency: z.string().trim().length(3).optional(),
  country: z.string().trim().length(2).optional(),
  customDomain: optionalString,
  isActive: z.coerce.boolean().optional(),
  heroUrl: optionalString,
  logoUrl: optionalString,
  // Storefront credibility strip.
  rating: z.coerce.number().min(0).max(5).nullable().optional(),
  ratingCount: z.coerce.number().int().min(0).optional(),
  prepMinutesMin: z.coerce.number().int().min(0).optional(),
  prepMinutesMax: z.coerce.number().int().min(0).optional(),
});

export const tenantUpdateSchema = tenantSchema.partial();

/**
 * What a restaurant's own admin may change about its identity — name, banner,
 * logo, tagline, cuisine tag. Deliberately a small subset of tenantSchema:
 * slug, customDomain and isActive stay platform-operator-only, since those
 * affect routing and multi-tenancy safety rather than how the storefront
 * looks.
 */
export const tenantBrandingSchema = z.object({
  nameEn: z.string().trim().min(1).optional(),
  nameAr: z.string().trim().min(1).optional(),
  taglineEn: optionalString,
  taglineAr: optionalString,
  cuisineEn: optionalString,
  cuisineAr: optionalString,
  heroUrl: optionalString,
  logoUrl: optionalString,
});

/**
 * A new restaurant, plus the one account that can actually sign into it.
 *
 * A Tenant row with nobody able to log in is a dead end — whoever created it
 * would have to come back through the database to hand it an admin. Its
 * password is generated server-side and returned once, the same as
 * rotate-credentials: nothing this sensitive should be typed into a form
 * field that a screen-recording or a shoulder could catch.
 */
export const tenantCreateSchema = tenantSchema.extend({
  adminEmail: z.string().trim().toLowerCase().email(),
  adminName: optionalString,
});
