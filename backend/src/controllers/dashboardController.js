import { HttpError } from '../middleware/error.js';
import * as service from '../services/dashboardService.js';

/** A branch id, or 'none' for orders from before branches existed; empty means all branches. */
const branchParam = (value) => {
  if (!value) return undefined;
  if (value !== 'none' && !/^[0-9a-f-]{36}$/i.test(value)) throw new HttpError(400, 'Invalid branch');
  return value;
};

export const stats = async (req, res) =>
  res.json(await service.stats({ range: req.query.range || 'daily', branchId: branchParam(req.query.branchId) }));

export const branches = async (req, res) => {
  const period = req.query.period || 'today';
  if (!service.BRANCH_PERIODS[period]) throw new HttpError(400, 'Period must be today, 7d or 30d');
  res.json(await service.branches({ period }));
};
