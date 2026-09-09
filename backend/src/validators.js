import { z } from 'zod';

const price = z.coerce.number().min(0);
const optionalString = z.string().trim().optional().nullable();

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
  categoryId: z.string().uuid(),
  imageId: z.string().uuid().optional().nullable(),
  isAvailable: z.coerce.boolean().optional(),
  isOutOfStock: z.coerce.boolean().optional(),
  isFeatured: z.coerce.boolean().optional(),
  isCustomizable: z.coerce.boolean().optional(),
  displayOrder: z.coerce.number().int().optional(),
  options: z.array(customizationOptionSchema).optional(),
});

export const itemUpdateSchema = itemSchema.partial();

export const reorderSchema = z.object({ orderedIds: z.array(z.string().uuid()).min(1) });

export const bulkAvailabilitySchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  isAvailable: z.coerce.boolean(),
});

export const orderSchema = z.object({
  customerName: z.string().trim().min(1),
  customerPhone: z.string().trim().min(6),
  address: optionalString,
  notes: optionalString,
  paymentMethod: z.enum(['CASH', 'KNET', 'CARD', 'WHATSAPP']).optional(),
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
