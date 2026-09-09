import * as service from '../services/feedbackService.js';

export const list = async (req, res) =>
  res.json(await service.list({ page: req.query.page || 1, pageSize: req.query.pageSize || 20 }));
