import * as service from '../services/itemService.js';
import { bulkAvailabilitySchema, itemSchema, itemUpdateSchema, reorderSchema } from '../validators.js';

export const list = async (req, res) =>
  res.json(
    await service.list({
      categoryId: req.query.categoryId,
      search: req.query.search,
      availableOnly: req.query.availableOnly === 'true',
      featuredOnly: req.query.featured === 'true',
    }),
  );
export const getById = async (req, res) => res.json(await service.getById(req.params.id));
export const create = async (req, res) => res.status(201).json(await service.create(itemSchema.parse(req.body)));
export const update = async (req, res) => res.json(await service.update(req.params.id, itemUpdateSchema.parse(req.body)));
export const remove = async (req, res) => {
  await service.remove(req.params.id);
  res.status(204).end();
};
export const reorder = async (req, res) => res.json(await service.reorder(reorderSchema.parse(req.body).orderedIds));
export const bulkAvailability = async (req, res) => {
  const { ids, isAvailable } = bulkAvailabilitySchema.parse(req.body);
  res.json(await service.bulkAvailability(ids, isAvailable));
};
