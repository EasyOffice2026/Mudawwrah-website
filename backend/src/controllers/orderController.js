import * as service from '../services/orderService.js';
import { orderSchema, orderStatusSchema } from '../validators.js';

export const create = async (req, res) => {
  const data = orderSchema.parse(req.body);
  res.status(201).json(await service.create({ ...data, userId: req.user?.sub }));
};

// req.user is passed along so branch accounts only ever see their own branch's orders.
export const list = async (req, res) =>
  res.json(
    await service.list(
      {
        status: req.query.status,
        channel: req.query.channel,
        from: req.query.from,
        to: req.query.to,
        search: req.query.search,
        branchId: req.query.branchId,
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 20,
      },
      req.user,
    ),
  );

export const getById = async (req, res) => res.json(await service.getById(req.params.id, req.user));

export const feed = async (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : null;
  res.json(await service.feed({ since: since && !Number.isNaN(since.getTime()) ? since : null }, req.user));
};

export const updateStatus = async (req, res) =>
  res.json(await service.updateStatus(req.params.id, orderStatusSchema.parse(req.body).status, req.user));

/** Public status lookup for the tracking link handed out at checkout. */
export const track = async (req, res) => res.json(await service.track(req.params.id));

/** The signed-in customer's own order history. */
export const mine = async (req, res) =>
  res.json(await service.listMine(req.user.sub, { page: req.query.page || 1, pageSize: req.query.pageSize || 20 }));
