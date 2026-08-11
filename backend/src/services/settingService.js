import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenant, currentTenantId } from '../tenantContext.js';

export const DEFAULT_SETTINGS = {
  restaurantNameEn: 'Mdawra',
  restaurantNameAr: 'مدورة',
  logoUrl: '',
  contactPhone: '+965 0000 0000',
  whatsappNumber: '96500000000',
  address: 'Kuwait',
  workingHours: '08:00 - 23:00',
  deliveryFee: '1.000',
  minimumOrder: '2.000',
  serviceChargePercent: '0',
  taxPercent: '0',
  isOpen: 'true',
};

/** Defaults fall back to the tenant's own name rather than the platform's. */
const defaultsFor = (tenant) => ({
  ...DEFAULT_SETTINGS,
  ...(tenant ? { restaurantNameEn: tenant.nameEn, restaurantNameAr: tenant.nameAr } : {}),
});

export const getAll = async () => {
  const tenantId = currentTenantId();
  const defaults = defaultsFor(currentTenant());
  if (!tenantId) return defaults;
  const rows = await prisma.setting.findMany({ where: { tenantId } });
  return { ...defaults, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
};

export const updateMany = async (values) => {
  const tenantId = currentTenantId();
  if (!tenantId) throw new HttpError(400, 'No restaurant selected');
  const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== null);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: { value: String(value) },
        create: { tenantId, key, value: String(value) },
      }),
    ),
  );
  return getAll();
};
