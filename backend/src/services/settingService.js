import { prisma } from '../prisma.js';

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

export const getAll = async () => {
  const rows = await prisma.setting.findMany();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored };
};

export const updateMany = async (values) => {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== null);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      }),
    ),
  );
  return getAll();
};
