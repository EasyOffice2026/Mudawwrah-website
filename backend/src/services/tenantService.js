import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';

/**
 * Readable enough to retype off a phone, random enough to be worth having —
 * the same shape rotate-credentials.js issues, so a generated password never
 * looks meaningfully weaker depending on which script produced it.
 */
const generatePassword = () => {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const body = Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `Md-${body}-${crypto.randomInt(10, 100)}`;
};

const publicFields = {
  id: true,
  slug: true,
  nameEn: true,
  nameAr: true,
  taglineEn: true,
  taglineAr: true,
  cuisineEn: true,
  cuisineAr: true,
  heroUrl: true,
  logoUrl: true,
  rating: true,
  ratingCount: true,
  prepMinutesMin: true,
  prepMinutesMax: true,
  brandColor: true,
  brandDark: true,
  brandLight: true,
  accentColor: true,
  currency: true,
  country: true,
};

/** Powers the platform landing page that lists every restaurant. */
export const listPublic = () =>
  prisma.tenant.findMany({
    where: { isActive: true },
    select: { ...publicFields, _count: { select: { items: true, categories: true } } },
    orderBy: { createdAt: 'asc' },
  });

export const getBySlug = async (slug) => {
  const tenant = await prisma.tenant.findFirst({ where: { slug, isActive: true }, select: publicFields });
  if (!tenant) throw new HttpError(404, 'Restaurant not found');
  return tenant;
};

export const listAll = () => prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });

/**
 * Creates a restaurant together with the one account that can sign into it —
 * in one transaction, so a failure partway through never leaves a tenant with
 * no admin, or an admin whose tenant creation rolled back.
 *
 * The password is generated here and returned to the caller exactly once;
 * only its hash is stored, so this is the only moment it can be handed to the
 * restaurant.
 */
export const create = async ({ adminEmail, adminName, ...tenantData }) => {
  const slugTaken = await prisma.tenant.findUnique({ where: { slug: tenantData.slug } });
  if (slugTaken) throw new HttpError(409, `A restaurant with slug "${tenantData.slug}" already exists`);
  const emailTaken = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (emailTaken) throw new HttpError(409, `${adminEmail} is already in use by another account`);

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const { tenant, admin } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: tenantData });
    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: adminEmail,
        password: passwordHash,
        name: adminName || `${tenantData.nameEn} Admin`,
        role: 'ADMIN',
      },
      select: { id: true, email: true, name: true },
    });
    return { tenant, admin };
  });

  return { tenant, admin: { ...admin, password } };
};

export const update = async (id, data) => {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new HttpError(404, 'Restaurant not found');
  return prisma.tenant.update({ where: { id }, data });
};

/**
 * A restaurant editing its own name, banner and logo — the fields the
 * storefront header and the platform picker actually read. There is no id in
 * the request: the target is always whichever tenant resolveTenant already
 * put in context, so a store admin has no way to name another restaurant's
 * row even by tampering with the request.
 */
export const updateOwn = (data) => {
  const tenantId = currentTenantId();
  if (!tenantId) throw new HttpError(400, 'No restaurant selected');
  return prisma.tenant.update({ where: { id: tenantId }, data });
};
