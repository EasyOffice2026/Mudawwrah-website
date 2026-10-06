import * as payment from '../services/payment/index.js';
import { pushIfDue as pushToFoodics } from '../services/foodicsService.js';
import { notifyPaymentResult } from '../services/whatsapp/notifications.js';

/** Provider redirect/webhook target: `GET|POST /api/payments/:provider/callback`. */
export const callback = async (req, res) => {
  const result = await payment.handleCallback(req.params.provider, { ...req.query, ...req.body });
  if (result.paid || result.failed) await notifyPaymentResult(result.order, Boolean(result.paid));
  if (result.paid) pushToFoodics(result.order);
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
