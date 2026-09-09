import * as service from '../services/promotionService.js';
import { promoPreviewSchema, promotionSchema } from '../validators.js';

export const listPublic = async (req, res) => res.json(await service.listPublic());
export const listAll = async (req, res) => res.json(await service.listAll());

/** Checkout "Apply" — tells the customer what a code is worth on this cart. */
export const preview = async (req, res) => {
  const { code, subtotal } = promoPreviewSchema.parse(req.body);
  res.json(await service.preview(code, subtotal));
};

export const create = async (req, res) => res.status(201).json(await service.create(promotionSchema.parse(req.body)));
export const update = async (req, res) =>
  res.json(await service.update(req.params.id, promotionSchema.partial().parse(req.body)));
export const remove = async (req, res) => {
  await service.remove(req.params.id);
  res.status(204).end();
};
