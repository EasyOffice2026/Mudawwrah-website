import { prisma } from '../prisma.js';
import * as presence from '../services/presenceService.js';

// For the owner: which branch screens are connected, and from which address.
export const branches = async (req, res) => {
  const list = await prisma.pickupLocation.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, nameEn: true, nameAr: true },
  });
  res.set('Cache-Control', 'no-store');
  res.json(presence.statuses(req.tenant.id, list));
};
