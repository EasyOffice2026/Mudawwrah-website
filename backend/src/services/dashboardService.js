import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';
import { getAll as getSettings } from './settingService.js';

/**
 * Everything here is measured in the restaurant's own timezone.
 *
 * The KPI cards used to count from the *server's* local midnight while the
 * chart bucketed by UTC date, so the two disagreed — and on a UTC-hosted
 * server neither matched the restaurant's day. For a Kuwaiti restaurant open
 * past midnight that silently moved every late-night order into the previous
 * day's bar. Both now derive from the same zone.
 */

/** Milliseconds the given zone is ahead of UTC at that instant. */
const offsetMs = (date, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - date.getTime();
};

/** YYYY-MM-DD for an instant, as the calendar reads it in that zone. */
const dayKey = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(date),
  );

/** The UTC instant at which that zone's calendar day begins. */
const startOfZonedDay = (date, timeZone) => {
  const [y, m, d] = dayKey(date, timeZone).split('-').map(Number);
  const midnightAsUtc = Date.UTC(y, m - 1, d);
  // Correct the naive guess by the zone's offset at that moment, which also
  // lands correctly for zones that observe DST.
  return new Date(midnightAsUtc - offsetMs(new Date(midnightAsUtc), timeZone));
};

const bucketKey = (date, range, timeZone) => {
  const key = dayKey(date, timeZone);
  if (range === 'monthly') return key.slice(0, 7);
  if (range === 'weekly') {
    // Calendar arithmetic on a UTC-anchored copy of the zone's own date, so
    // the week never slips across a boundary.
    const [y, m, d] = key.split('-').map(Number);
    const anchor = new Date(Date.UTC(y, m - 1, d));
    anchor.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
    return anchor.toISOString().slice(0, 10);
  }
  return key;
};

/**
 * Narrows a query to one branch. 'none' means orders from before branches
 * existed (they carry no branch); anything falsy means every branch.
 */
const branchFilter = (branchId) => {
  if (!branchId) return {};
  return { branchId: branchId === 'none' ? null : branchId };
};

export const stats = async ({ range = 'daily', branchId } = {}) => {
  const settings = await getSettings();
  const timeZone = settings.timezone || 'Asia/Kuwait';
  const tenantId = currentTenantId();
  const branch = branchFilter(branchId);

  const today = startOfZonedDay(new Date(), timeZone);
  // Walk back whole days from the zone's midnight, then re-anchor, so the
  // window start is itself a real midnight in that zone.
  const since = new Date(today);
  if (range === 'monthly') since.setUTCMonth(since.getUTCMonth() - 11);
  else if (range === 'weekly') since.setUTCDate(since.getUTCDate() - 7 * 11);
  else since.setUTCDate(since.getUTCDate() - 29);

  const [todayOrders, todayRevenue, pendingOrders, cancelledToday, totalCustomers, periodOrders, recentOrders, topItems] =
    await Promise.all([
      prisma.order.count({ where: { ...branch, createdAt: { gte: today }, status: { not: 'CANCELLED' } } }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { ...branch, createdAt: { gte: today }, status: { not: 'CANCELLED' } },
      }),
      prisma.order.count({ where: { ...branch, status: 'PENDING' } }),
      prisma.order.count({ where: { ...branch, createdAt: { gte: today }, status: 'CANCELLED' } }),
      // Customers order as guests — there are no customer accounts — so
      // "customers" is the distinct phone numbers that have ordered. Counting
      // CUSTOMER users showed 0 forever, and wasn't tenant-scoped either.
      prisma.order.groupBy({ by: ['customerPhone'], where: branch }),
      prisma.order.findMany({
        where: { ...branch, createdAt: { gte: since }, status: { not: 'CANCELLED' } },
        select: { createdAt: true, total: true },
      }),
      prisma.order.findMany({ where: branch, orderBy: { createdAt: 'desc' }, take: 10, include: { items: true } }),
      // OrderItem has no tenant column, so the prisma extension can't scope it
      // (see prisma.js): without this filter every restaurant's dashboard
      // ranked the whole platform's best sellers.
      prisma.orderItem.groupBy({
        by: ['nameEn'],
        where: { order: { tenantId, ...branch, status: { not: 'CANCELLED' } } },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

  const buckets = new Map();
  for (const order of periodOrders) {
    const key = bucketKey(order.createdAt, range, timeZone);
    const current = buckets.get(key) || { period: key, orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue = Number((current.revenue + Number(order.total)).toFixed(3));
    buckets.set(key, current);
  }

  return {
    kpis: {
      todayOrders,
      todayRevenue: Number(todayRevenue._sum.total || 0),
      pendingOrders,
      cancelledOrders: cancelledToday,
      totalCustomers: totalCustomers.length,
    },
    revenueSeries: [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period)),
    recentOrders,
    bestSellers: topItems.map((t) => ({
      name: t.nameEn,
      quantity: t._sum.quantity || 0,
      revenue: Number(t._sum.lineTotal || 0),
    })),
  };
};

const STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'REACHED', 'DELIVERED', 'CANCELLED'];
export const BRANCH_PERIODS = { today: 1, '7d': 7, '30d': 30 };

const emptyRow = () => ({
  orders: 0, // placed and not cancelled
  revenue: 0,
  cancelled: 0,
  averageOrder: 0,
  statuses: Object.fromEntries(STATUSES.map((s) => [s, 0])),
});

/** Folds one groupBy row (a branch x status pair) into a branch's totals. */
const addTo = (row, { status, _count, _sum }) => {
  row.statuses[status] = (row.statuses[status] || 0) + _count._all;
  if (status === 'CANCELLED') row.cancelled += _count._all;
  else {
    row.orders += _count._all;
    row.revenue = Number((row.revenue + Number(_sum.total || 0)).toFixed(3));
  }
};

const finish = (row) => ({ ...row, averageOrder: row.orders ? Number((row.revenue / row.orders).toFixed(3)) : 0 });

/**
 * Side-by-side figures for every branch over a window ending now: orders,
 * revenue, cancellations and where each order currently stands. One grouped
 * query does the lot, so it stays cheap however many branches there are.
 * Orders from before branches existed carry no branch and are reported on
 * their own line rather than vanishing from the totals.
 */
export const branches = async ({ period = 'today' } = {}) => {
  const days = BRANCH_PERIODS[period] || 1;
  const settings = await getSettings();
  const timeZone = settings.timezone || 'Asia/Kuwait';
  const since = startOfZonedDay(new Date(), timeZone);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const [list, grouped] = await Promise.all([
    prisma.pickupLocation.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, nameEn: true, nameAr: true, isActive: true },
    }),
    prisma.order.groupBy({
      by: ['branchId', 'status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { total: true },
    }),
  ]);

  const rows = new Map(list.map((b) => [b.id, { ...b, ...emptyRow() }]));
  const total = emptyRow();
  let unassigned = null;
  for (const g of grouped) {
    let row = g.branchId ? rows.get(g.branchId) : null;
    if (!row && g.branchId) {
      // A branch since deleted: its orders still count, under its old id.
      row = { id: g.branchId, nameEn: null, nameAr: null, isActive: false, ...emptyRow() };
      rows.set(g.branchId, row);
    }
    if (!row) row = unassigned ||= { id: 'none', nameEn: null, nameAr: null, isActive: false, ...emptyRow() };
    addTo(row, g);
    addTo(total, g);
  }

  return {
    period,
    since,
    total: finish(total),
    branches: [...rows.values(), ...(unassigned ? [unassigned] : [])].map(finish),
  };
};
