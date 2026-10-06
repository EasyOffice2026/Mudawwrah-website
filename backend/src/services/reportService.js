import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';
import { dateKey } from './orderNumber.js';
import { isOnlinePaymentEnabled } from './payment/index.js';
import { computeReport, normalisePhone } from './reportCompute.js';
import { resolveRange } from './reportRange.js';
import { getAll as getSettings } from './settingService.js';

const DAY = 24 * 3600 * 1000;

// Only what the figures use — no addresses, notes or payment references.
const ORDER_FIELDS = {
  id: true,
  status: true,
  total: true,
  discount: true,
  createdAt: true,
  customerPhone: true,
  customerName: true,
  paymentMethod: true,
  paymentStatus: true,
  channel: true,
  orderType: true,
  promoCode: true,
  utmSource: true,
  referrer: true,
  area: true,
  block: true,
  branchId: true,
  confirmedAt: true,
  preparingAt: true,
  readyAt: true,
  outForDeliveryAt: true,
  deliveredAt: true,
  cancelReason: true,
  zone: { select: { nameEn: true, nameAr: true } },
};

const ITEM_FIELDS = { menuItemId: true, nameEn: true, nameAr: true, quantity: true, lineTotal: true, customizations: true };

/** '' = every branch, 'none' = orders from before branches existed, else one branch. */
const branchWhere = (branchId) => (!branchId ? {} : { branchId: branchId === 'none' ? null : branchId });

/**
 * The Reports page in one call. Must run inside the restaurant's tenant
 * context: every model here except SiteVisit is scoped by the prisma
 * extension, and SiteVisit carries the tenant explicitly.
 */
export const report = async ({ preset, from, to, branchId } = {}, now = new Date()) => {
  const settings = await getSettings();
  const timeZone = settings.timezone || 'Asia/Kuwait';
  const range = resolveRange({ preset, from, to }, timeZone, now);
  const branch = branchWhere(branchId);
  const tenantId = currentTenantId();

  const [orders, prevOrders, historyRows, menuItems, categories, allBranches, visits, firstVisit] = await Promise.all([
    prisma.order.findMany({
      where: { ...branch, createdAt: { gte: range.from, lt: range.to } },
      select: { ...ORDER_FIELDS, items: { select: ITEM_FIELDS } },
    }),
    prisma.order.findMany({
      where: { ...branch, createdAt: { gte: range.prevFrom, lt: range.prevTo } },
      select: { status: true, total: true, branchId: true, createdAt: true },
    }),
    // Every customer ever, at every branch: "new" and "returning" must not
    // depend on which branch or period is being looked at.
    prisma.order.groupBy({
      by: ['customerPhone'],
      where: { status: { not: 'CANCELLED' } },
      _min: { createdAt: true },
      _max: { createdAt: true },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.menuItem.findMany({ select: { id: true, nameEn: true, nameAr: true, categoryId: true, isAvailable: true, isOutOfStock: true, createdAt: true } }),
    prisma.category.findMany({ orderBy: { displayOrder: 'asc' }, select: { id: true, nameEn: true, nameAr: true } }),
    prisma.pickupLocation.findMany({ orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, nameEn: true, nameAr: true } }),
    branchId
      ? []
      : prisma.siteVisit.findMany({
          where: { tenantId, day: { gte: dateKey(range.from, timeZone), lte: dateKey(new Date(range.to.getTime() - 1), timeZone) } },
          select: { day: true, sessions: true },
        }),
    prisma.siteVisit.findFirst({ where: { tenantId }, orderBy: { day: 'asc' }, select: { day: true } }),
  ]);

  const history = historyRows.map((r) => ({
    customerPhone: r.customerPhone,
    first: r._min.createdAt,
    last: r._max.createdAt,
    orders: r._count._all,
    spend: Number(r._sum.total || 0),
  }));

  // Names for the "haven't ordered in 30 days" list: the name on their latest order.
  const cutoff = new Date(now.getTime() - 30 * DAY);
  const quiet = history.filter((h) => new Date(h.last) < cutoff).map((h) => h.customerPhone);
  const lapsedNames = new Map();
  if (quiet.length) {
    const latest = await prisma.order.findMany({
      where: { customerPhone: { in: quiet } },
      orderBy: { createdAt: 'desc' },
      distinct: ['customerPhone'],
      select: { customerPhone: true, customerName: true },
    });
    for (const row of latest) {
      const phone = normalisePhone(row.customerPhone);
      if (phone && !lapsedNames.has(phone)) lapsedNames.set(phone, row.customerName);
    }
  }

  // With a branch picked, only that branch is compared; otherwise all of them.
  const branches = !branchId ? allBranches : allBranches.filter((b) => b.id === branchId);

  return computeReport({
    range,
    orders,
    prevOrders,
    history,
    lapsedNames,
    menuItems,
    categories,
    branches,
    visits,
    visitTrackingStart: firstVisit?.day || null,
    now,
    lateAfterMinutes: Number(settings.lateAfterMinutes) || 45,
    onlinePayments: isOnlinePaymentEnabled(),
    branchFiltered: Boolean(branchId),
  });
};
