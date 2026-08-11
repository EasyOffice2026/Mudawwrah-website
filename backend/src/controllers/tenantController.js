import { HttpError } from '../middleware/error.js';
import * as service from '../services/tenantService.js';
import { tenantSchema, tenantUpdateSchema } from '../validators.js';

export const listPublic = async (req, res) => res.json(await service.listPublic());

export const current = async (req, res) => {
  if (!req.tenant) throw new HttpError(404, 'No restaurant resolved for this request');
  res.json(await service.getBySlug(req.tenant.slug));
};

export const getBySlug = async (req, res) => res.json(await service.getBySlug(req.params.slug));

export const listAll = async (req, res) => res.json(await service.listAll());

export const create = async (req, res) => res.status(201).json(await service.create(tenantSchema.parse(req.body)));

export const update = async (req, res) =>
  res.json(await service.update(req.params.id, tenantUpdateSchema.parse(req.body)));
