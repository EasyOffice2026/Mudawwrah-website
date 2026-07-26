import { prisma } from '../prisma.js';

export const list = async ({ page = 1, pageSize = 20 } = {}) => {
  const [total, data, aggregate] = await Promise.all([
    prisma.orderFeedback.count(),
    prisma.orderFeedback.findMany({
      include: { order: { select: { orderNumber: true, customerName: true, total: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
    }),
    prisma.orderFeedback.aggregate({ _avg: { rating: true } }),
  ]);
  return {
    data,
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : null,
  };
};
