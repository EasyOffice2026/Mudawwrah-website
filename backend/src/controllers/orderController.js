import { HttpError } from '../middleware/error.js';
import * as service from '../services/orderService.js';
import { startPayment } from '../services/payment/index.js';
import { orderSchema, orderStatusSchema } from '../validators.js';

export const create = async (req, res) => {
  const data = orderSchema.parse(req.body);
  const order = await service.create({ ...data, userId: req.user?.sub });
  // Cash and WhatsApp orders are placed as they are. An online payment goes on to the gateway's
  // page: the answer carries its address and the storefront sends the customer there.
  if (order.paymentStatus !== 'PENDING') return res.status(201).json(order);
  try {
    const link = await startPayment(order, req.body?.lang === 'ar' ? 'ar' : 'en');
    return res.status(201).json({ ...order, paymentStatus: 'PENDING', paymentUrl: link.url });
  } catch (error) {
    console.error('[payment] could not open the payment page', error);
    await service.cancelUnpaid(order.id);
    throw new HttpError(502, 'The payment page could not be opened. Nothing was charged. Please try again.');
  }
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

export const updateStatus = async (req, res) => {
  const { status, cancelReason, cancelNote } = orderStatusSchema.parse(req.body);
  res.json(await service.updateStatus(req.params.id, status, req.user, { cancelReason, cancelNote }));
};

/** Public status lookup for the tracking link handed out at checkout. */
export const track = async (req, res) => res.json(await service.track(req.params.id));

/** The signed-in customer's own order history. */
export const mine = async (req, res) =>
  res.json(await service.listMine(req.user.sub, { page: req.query.page || 1, pageSize: req.query.pageSize || 20 }));
