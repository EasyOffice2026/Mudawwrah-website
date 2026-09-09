import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';

const round3 = (value) => Number(Number(value).toFixed(3));

const publicFields = {
  id: true,
  code: true,
  titleEn: true,
  titleAr: true,
  subtitleEn: true,
  subtitleAr: true,
  type: true,
  value: true,
  minOrder: true,
  maxDiscount: true,
};

const liveWindow = () => {
  const now = new Date();
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
};

/** Offer strip on the storefront — every code currently running. */
export const listPublic = () =>
  prisma.promotion.findMany({ where: liveWindow(), select: publicFields, orderBy: { createdAt: 'asc' } });

export const listAll = () => prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } });

/**
 * Resolves a code to the amount it takes off a given subtotal.
 *
 * Returns `{ promotion, discount, freeDelivery }`. Callers that are pricing an
 * order must use the returned numbers rather than anything the client sent.
 */
export const resolve = async (code, subtotal, deliveryFee = 0) => {
  if (!code) return { promotion: null, discount: 0, freeDelivery: false };

  const promotion = await prisma.promotion.findFirst({
    where: { code: { equals: String(code).trim(), mode: 'insensitive' }, ...liveWindow() },
  });
  if (!promotion) throw new HttpError(404, 'That promo code is not valid');

  if (Number(subtotal) < Number(promotion.minOrder)) {
    throw new HttpError(422, `Add KWD ${(Number(promotion.minOrder) - Number(subtotal)).toFixed(3)} more to use this code`);
  }

  if (promotion.type === 'FREE_DELIVERY') {
    return { promotion, discount: 0, freeDelivery: true };
  }

  let discount =
    promotion.type === 'PERCENT'
      ? (Number(subtotal) * Number(promotion.value)) / 100
      : Number(promotion.value);

  if (promotion.maxDiscount != null) discount = Math.min(discount, Number(promotion.maxDiscount));
  // Never let a voucher exceed the cart or turn the total negative.
  discount = Math.min(discount, Number(subtotal));

  return { promotion, discount: round3(discount), freeDelivery: false };
};

/** Checkout "Apply" button — same maths as the order, without placing one. */
export const preview = async (code, subtotal, deliveryFee) => {
  const { promotion, discount, freeDelivery } = await resolve(code, subtotal, deliveryFee);
  return {
    code: promotion.code,
    titleEn: promotion.titleEn,
    titleAr: promotion.titleAr,
    discount,
    freeDelivery,
  };
};

export const create = (data) => prisma.promotion.create({ data });

export const update = async (id, data) => {
  const existing = await prisma.promotion.findFirst({ where: { id } });
  if (!existing) throw new HttpError(404, 'Promotion not found');
  return prisma.promotion.update({ where: { id }, data });
};

export const remove = async (id) => {
  const existing = await prisma.promotion.findFirst({ where: { id } });
  if (!existing) throw new HttpError(404, 'Promotion not found');
  await prisma.promotion.delete({ where: { id } });
};
