import { HttpError } from '../middleware/error.js';
import { clientIp } from '../services/authService.js';
import * as events from '../services/orderEvents.js';
import * as presence from '../services/presenceService.js';
import * as service from '../services/orderService.js';
import { startPayment } from '../services/payment/index.js';
import { orderSchema, orderStatusSchema } from '../validators.js';

/** For an uptime monitor: 200 while every order is being accepted in time, 503 once one has waited too long. */
export const health = async (req, res) => {
  const late = await service.lateOrders();
  res.status(late ? 503 : 200).json({ status: late ? 'orders waiting too long' : 'ok' });
};

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

// A branch screen checking in counts as "connected" for the owner's view.
const markSeen = (req) => {
  if (req.user?.role === 'BRANCH') presence.touch(req.tenant.id, req.user.branchId, clientIp(req));
};

/**
 * The order screen's live connection: one long-lived response that says "orders" the moment an order is placed, paid
 * or moved, so the screen fetches at once instead of at its next check. Sent as server-sent events with a heartbeat
 * every 20 seconds, which also keeps proxies from closing it and tells the owner this screen is still there.
 */
export const stream = (req, res) => {
  const branchId = req.user?.role === 'BRANCH' ? req.user.branchId : null;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  req.socket.setTimeout(0);
  res.write('retry: 3000\n\n');
  markSeen(req);
  const stop = events.watch(req.tenant.id, branchId, (type) => res.write(`data: ${type}\n\n`));
  const beat = setInterval(() => {
    markSeen(req);
    res.write(': ping\n\n');
  }, 20000);
  req.on('close', () => {
    clearInterval(beat);
    stop();
  });
  res.write('data: hello\n\n');
};

export const feed = async (req, res) => {
  markSeen(req);
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
