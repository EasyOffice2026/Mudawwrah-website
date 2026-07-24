import * as service from '../services/categoryService.js';
import { categorySchema, categoryUpdateSchema, reorderSchema } from '../validators.js';

export const listPublic = async (req, res) => res.json(await service.listPublic());
export const listAll = async (req, res) => res.json(await service.listAll());
export const getById = async (req, res) => res.json(await service.getById(req.params.id));
export const create = async (req, res) => res.status(201).json(await service.create(categorySchema.parse(req.body)));
export const update = async (req, res) => res.json(await service.update(req.params.id, categoryUpdateSchema.parse(req.body)));
export const remove = async (req, res) => {
  await service.remove(req.params.id);
  res.status(204).end();
};
export const reorder = async (req, res) => res.json(await service.reorder(reorderSchema.parse(req.body).orderedIds));
