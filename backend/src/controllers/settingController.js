import * as service from '../services/settingService.js';
import { settingsSchema } from '../validators.js';

export const get = async (req, res) => res.json(await service.getAll());

export const update = async (req, res) => res.json(await service.updateMany(settingsSchema.parse(req.body)));
