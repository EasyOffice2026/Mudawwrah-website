import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { runWithTenant } from '../tenantContext.js';
import * as payment from '../services/payment/index.js';
import { getAll as getSettings } from '../services/settingService.js';
import { pushIfDue as pushToFoodics } from '../services/foodicsService.js';
import { notifyNewOrder, notifyPaymentResult } from '../services/whatsapp/notifications.js';

// The storefront page the customer lands on after paying: the menu, with the result in the address.
const storefrontLink = async (order) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: order.tenantId } });
  const state = order.paymentStatus === 'PAID' ? 'paid' : order.paymentStatus === 'FAILED' ? 'failed' : 'pending';
  return `${config.storefrontUrl}/r/${tenant?.slug ?? ''}?payment=${state}&order=${encodeURIComponent(order.orderNumber)}`;
};

// A website order that waited for its payment reaches the staff once it is paid.
const tellStaff = async (order) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: order.tenantId } });
  await runWithTenant(tenant, async () => notifyNewOrder(order, await getSettings()));
};

/** Provider redirect/webhook target: `GET|POST /api/payments/:provider/callback`. */
export const callback = async (req, res) => {
  const result = await payment.handleCallback(req.params.provider, { ...req.query, ...req.body });
  if (result.paid || result.failed) await notifyPaymentResult(result.order, Boolean(result.paid));
  if (result.paid) {
    pushToFoodics(result.order);
    if (result.order.channel === 'WEB') tellStaff(result.order).catch((e) => console.error('[payment] staff notice failed', e));
  }
  // The customer's browser comes back with a GET: take it to the storefront. The gateway's own
  // notice is a POST, and gets the JSON.
  if (req.method === 'GET' && req.params.provider === 'tap') return res.redirect(await storefrontLink(result.order));
  res.json({
    orderNumber: result.order.orderNumber,
    paymentStatus: result.order.paymentStatus,
    status: result.order.status,
  });
};

/** Development helper used by the `mock` payment provider. */
export const mockPay = async (req, res) => {
  const result = await payment.handleCallback('mock', { paymentId: req.query.ref });
  if (result.paid) {
    await notifyPaymentResult(result.order, true);
    pushToFoodics(result.order);
  }
  res.send(`Payment recorded for order ${result.order.orderNumber}. You can close this page.`);
};
