import { prisma } from '../prisma.js';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const bucketKey = (date, range) => {
  const d = new Date(date);
  if (range === 'monthly') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (range === 'weekly') {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
};

export const stats = async ({ range = 'daily' } = {}) => {
  const today = startOfToday();
  const since = new Date(today);
  if (range === 'monthly') since.setMonth(since.getMonth() - 11);
  else if (range === 'weekly') since.setDate(since.getDate() - 7 * 11);
  else since.setDate(since.getDate() - 29);

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
    const key = bucketKey(order.createdAt, range);
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
