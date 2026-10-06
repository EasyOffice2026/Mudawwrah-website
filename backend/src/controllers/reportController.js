import { HttpError } from '../middleware/error.js';
import * as service from '../services/reportService.js';

/** A branch id, or 'none' for orders from before branches existed; empty means all branches. */
const branchParam = (value) => {
  if (!value) return undefined;
  if (value !== 'none' && !/^[0-9a-f-]{36}$/i.test(value)) throw new HttpError(400, 'Invalid branch');
  return value;
};

export const report = async (req, res) => {
  const { preset = '7d', from, to } = req.query;
  try {
    res.json(await service.report({ preset, from, to, branchId: branchParam(req.query.branchId) }));
  } catch (error) {
    if (error instanceof RangeError) throw new HttpError(400, error.message);
    throw error;
  }
};
