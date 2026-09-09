import * as service from '../services/orderService.js';
import { orderSchema, orderStatusSchema } from '../validators.js';

export const create = async (req, res) => {
  const data = orderSchema.parse(req.body);
  res.status(201).json(await service.create({ ...data, userId: req.user?.sub }));
};

export const list = async (req, res) =>
  res.json(
    await service.list({
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
      search: req.query.search,
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 20,
    }),
  );

export const getById = async (req, res) => res.json(await service.getById(req.params.id));

export const updateStatus = async (req, res) =>
  res.json(await service.updateStatus(req.params.id, orderStatusSchema.parse(req.body).status));
