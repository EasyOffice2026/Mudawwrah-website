import { prisma } from '../prisma.js';
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

export const stats = async ({ range = 'daily' } = {}) => {
  const settings = await getSettings();
  const timeZone = settings.timezone || 'Asia/Kuwait';

  const today = startOfZonedDay(new Date(), timeZone);
  // Walk back whole days from the zone's midnight, then re-anchor, so the
  // window start is itself a real midnight in that zone.
  const since = new Date(today);
  if (range === 'monthly') since.setUTCMonth(since.getUTCMonth() - 11);
  else if (range === 'weekly') since.setUTCDate(since.getUTCDate() - 7 * 11);
  else since.setUTCDate(since.getUTCDate() - 29);

  const [todayOrders, todayRevenue, pendingOrders, totalCustomers, periodOrders, recentOrders, topItems] =
    await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: today }, status: { not: 'CANCELLED' } } }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: today }, status: { not: 'CANCELLED' } },
      }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.order.findMany({
        where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
        select: { createdAt: true, total: true },
      }),
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { items: true } }),
      prisma.orderItem.groupBy({
        by: ['nameEn'],
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
      totalCustomers,
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
