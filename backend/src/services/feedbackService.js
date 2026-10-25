import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';

export const list = async ({ page = 1, pageSize = 20 } = {}) => {
  // Feedback carries no restaurant of its own and is not scoped automatically: it belongs to the restaurant of
  // its order. Without this every restaurant's staff read every other restaurant's customer comments.
  const tenantId = currentTenantId();
  if (!tenantId) throw new HttpError(400, 'No restaurant selected');
  const where = { order: { tenantId } };
  const [total, data, aggregate] = await Promise.all([
    prisma.orderFeedback.count({ where }),
    prisma.orderFeedback.findMany({
      where,
      include: { order: { select: { orderNumber: true, customerName: true, total: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
    }),
    prisma.orderFeedback.aggregate({ where, _avg: { rating: true } }),
  ]);
  return {
    data,
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : null,
  };
};
