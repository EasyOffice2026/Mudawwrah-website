import * as service from '../services/dashboardService.js';

export const stats = async (req, res) => res.json(await service.stats({ range: req.query.range || 'daily' }));
