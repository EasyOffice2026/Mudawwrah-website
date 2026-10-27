import { config } from '../config.js';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { runWithTenant } from '../tenantContext.js';
import * as payment from '../services/payment/index.js';
import * as paymentSettings from '../services/paymentSettingsService.js';
import * as reconcile from '../services/reconcileService.js';
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
// What follows a payment decided by the gateway, however it reached us: the customer is told, the order goes to
// Foodics, and staff hear about a website order. The order's own restaurant is used, since the call carries none.
const afterPayment = async (result) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: result.order.tenantId } });
  if (result.paid || result.failed) {
    await runWithTenant(tenant, () => notifyPaymentResult(result.order, Boolean(result.paid)));
  }
  if (result.paid) {
    pushToFoodics(result.order);
    if (result.order.channel === 'WEB') tellStaff(result.order).catch((e) => console.error('[payment] staff notice failed', e));
  }
};

export const callback = async (req, res) => {
  const result = await payment.handleCallback(req.params.provider, { ...req.query, ...req.body });
  await afterPayment(result);
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
  // The pretend gateway marks any order paid. It exists for local runs and tests only, never next to a real one.
  if (config.payment.provider !== 'mock') throw new HttpError(404, 'Not found');
  const result = await payment.handleCallback('mock', { paymentId: req.query.ref });
  if (result.paid) {
    await notifyPaymentResult(result.order, true);
    pushToFoodics(result.order);
  }
  res.send(`Payment recorded for order ${result.order.orderNumber}. You can close this page.`);
};

/** The owner's online-payment settings: which Tap account is used, and saving or removing the restaurant's own key. */
export const settings = async (req, res) => res.json(paymentSettings.get());
export const saveSettings = async (req, res) => res.json(await paymentSettings.setKey(req.body?.secretKey));
export const removeSettings = async (req, res) => res.json(await paymentSettings.removeKey());

/** A payment Tap captured whose notice never arrived, found by the daily check, recorded by the owner or staff. */
export const recordMissed = async (req, res) => {
  const result = await reconcile.recordMissedPayment(req.params.reference);
  await afterPayment(result);
  res.json({ orderNumber: result.order.orderNumber, paymentStatus: result.order.paymentStatus, refundNeeded: Boolean(result.refundNeeded) });
};
