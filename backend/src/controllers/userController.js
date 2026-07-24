import * as service from '../services/userService.js';
import { userSchema, userUpdateSchema } from '../validators.js';

export const list = async (req, res) => res.json(await service.list({ role: req.query.role, search: req.query.search }));
export const getById = async (req, res) => res.json(await service.getById(req.params.id));
export const create = async (req, res) => res.status(201).json(await service.create(userSchema.parse(req.body)));
export const update = async (req, res) => res.json(await service.update(req.params.id, userUpdateSchema.parse(req.body)));
export const remove = async (req, res) => {
  await service.remove(req.params.id);
  res.status(204).end();
};
