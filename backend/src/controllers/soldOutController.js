import { HttpError } from '../middleware/error.js';
import * as service from '../services/soldOutService.js';
import { branchSoldOutSchema } from '../validators.js';

// Branch accounts always act on their own branch; the owner and staff pick one.
const branchFor = (req, requested) => {
  if (req.user.role === 'BRANCH') return req.user.branchId;
  if (!requested) throw new HttpError(400, 'branchId is required');
  return requested;
};

export const list = async (req, res) => res.json({ menuItemIds: await service.listForBranch(branchFor(req, req.query.branchId)) });

export const set = async (req, res) => {
  const data = branchSoldOutSchema.parse(req.body);
  res.json(await service.set({ ...data, branchId: branchFor(req, data.branchId) }));
};
