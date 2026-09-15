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
  // IANA zone the restaurant's trading day is measured in. Dashboard day
  // boundaries and chart buckets both derive from this, so a shop open past
  // midnight reports late-night orders on the day it actually traded them.
  timezone: 'Asia/Kuwait',
  // Checkout fulfilment: a restaurant can offer delivery, pickup, or both.
  deliveryEnabled: 'true',
  pickupEnabled: 'true',
  pickupAddressEn: '',
  pickupAddressAr: '',
  pickupWaitMinutes: '15',
  // Which payment methods the checkout offers, in the order shown. Cash is
  // off by default at the client's request; a restaurant that wants it back
  // adds CASH here from Admin -> Settings rather than needing a code change.
  paymentMethods: 'KNET,CARD',
  // Rider tipping, shown only on delivery orders.
  tipsEnabled: 'true',
  tipPresets: '0.350,0.700,1.000',
  // Marketing tags the restaurant owns, injected into its storefront only.
  //
  // Stored as bare IDs rather than pasted <script> blocks: the restaurant is
  // giving us an account number, not code to run, and accepting markup here
  // would let anyone with admin access run arbitrary JavaScript on the
  // storefront — including on the checkout page.
  trackingGa4: '',
  trackingGtm: '',
  trackingMetaPixel: '',
  trackingTiktokPixel: '',
  trackingSnapPixel: '',
};

/** Shape each tracking id must match before it is written or emitted. */
export const TRACKING_IDS = {
  trackingGa4: /^G-[A-Z0-9]{4,15}$/i,
  trackingGtm: /^GTM-[A-Z0-9]{4,10}$/i,
  trackingMetaPixel: /^\d{8,20}$/,
  trackingTiktokPixel: /^[A-Z0-9]{10,30}$/i,
  trackingSnapPixel: /^[a-f0-9-]{20,60}$/i,
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

/**
 * Rejects anything in a tracking field that is not the plain id it should be.
 *
 * Settings otherwise take any string, and these particular strings are printed
 * into the storefront's HTML. Without this, "paste your pixel id" would be an
 * invitation to paste a <script> tag and have it run on every page, checkout
 * included — an admin account would become arbitrary code execution against
 * the restaurant's own customers. Clearing a field stays allowed.
 */
const assertTrackingIds = (values) => {
  for (const [key, pattern] of Object.entries(TRACKING_IDS)) {
    const raw = values[key];
    if (raw === undefined || raw === null) continue;
    const value = String(raw).trim();
    if (value === '') continue;
    if (!pattern.test(value)) {
      throw new HttpError(400, `${key} does not look like a valid id. Enter the id on its own, not a script tag.`);
    }
  }
};

export const updateMany = async (values) => {
  const tenantId = currentTenantId();
  if (!tenantId) throw new HttpError(400, 'No restaurant selected');
  assertTrackingIds(values);
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
