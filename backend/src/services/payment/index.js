import { config } from '../../config.js';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma.js';
import { currentTenant } from '../../tenantContext.js';
import { statusStamp } from '../statusTimes.js';
import * as mock from './mock.js';
import * as myfatoorah from './myfatoorah.js';
import * as tap from './tap.js';

const providers = { tap, myfatoorah, mock };

export const getProvider = (name = config.payment.provider) => providers[name] || null;

/** Online payment is on for the current restaurant only if it is listed in ONLINE_PAYMENT_TENANTS. */
export const isOnlinePaymentEnabled = () => {
  const slug = String(currentTenant()?.slug || '').toLowerCase();
  if (!slug || !config.payment.tenants.includes(slug)) return false;
  const provider = getProvider();
  return Boolean(provider && provider.isConfigured());
};

const callbackUrl = (provider) => `${config.apiUrl}/api/payments/${provider.name}/callback`;

/** Creates a hosted payment link for an order and stores the provider reference on it. */
export const startPayment = async (order, lang = 'en') => {
  const provider = getProvider();
  if (!isOnlinePaymentEnabled()) return null;
  const { url, reference } = await provider.createPaymentLink({
    order,
    lang,
    callbackUrl: callbackUrl(provider),
  });
  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentProvider: provider.name,
      paymentRef: reference,
      paymentUrl: url,
      paymentStatus: 'PENDING',
      paymentMethod: 'KNET',
    },
  });
  return { url, reference, provider: provider.name };
};

/**
 * Resolves a provider callback by asking the provider for the authoritative payment
 * status, then updates the matching order. Returns the updated order or null.
 */
export const handleCallback = async (providerName, query) => {
  const provider = getProvider(providerName);
  if (!provider) throw new HttpError(404, `Unknown payment provider ${providerName}`);
  // Tap sends the customer back with tap_id, and posts the charge itself, whose id is "id".
  const paymentId =
    query.paymentId ||
    query.PaymentId ||
    query.ref ||
    query.tap_id ||
    (providerName === 'tap' ? query.id : null) ||
    null;
  const invoiceId = query.invoiceId || query.InvoiceId || query.Id || null;
  if (!paymentId && !invoiceId) throw new HttpError(400, 'Missing payment reference');

  // The gateway is the authority on the payment. If it cannot say (it is down, or does not know
  // the reference), nothing changes, and a webhook is answered with an error so it is sent again.
  const status = await provider.getPaymentStatus({ paymentId, invoiceId }).catch((error) => {
    console.error(`[payment] ${provider.name}: status lookup failed`, error.message);
    throw new HttpError(502, 'The payment could not be confirmed');
  });
  const order = await prisma.order.findFirst({
    where: {
      paymentProvider: provider.name,
      OR: [
        { paymentRef: status.reference },
        ...(invoiceId ? [{ paymentRef: String(invoiceId) }] : []),
        ...(paymentId ? [{ orderNumber: String(paymentId) }] : []),
      ],
    },
    include: { items: true },
  });
  if (!order) throw new HttpError(404, 'Order for this payment was not found');
  if (order.paymentStatus === 'PAID') return { order, alreadyProcessed: true };
  if (!status.paid && !status.failed) return { order, pending: true };
  // The charge must be for this order's total; anything else is not a payment of it.
  if (status.paid && status.amount !== undefined && Math.abs(status.amount - Number(order.total)) > 0.0005) {
    console.error(`[payment] ${order.orderNumber}: charged ${status.amount}, order total ${order.total}`);
    return { order, pending: true };
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: status.paid
      ? {
          paymentStatus: 'PAID',
          paidAt: new Date(),
          ...(order.status === 'PENDING' ? { status: 'CONFIRMED', ...statusStamp(order, 'CONFIRMED') } : {}),
        }
      : {
          paymentStatus: 'FAILED',
          // A website order that was never paid is cancelled, so it never reaches the kitchen.
          ...(order.channel === 'WEB' && order.status === 'PENDING'
            ? { status: 'CANCELLED', ...statusStamp(order, 'CANCELLED') }
            : {}),
        },
    include: { items: true },
  });
  return { order: updated, paid: status.paid, failed: status.failed };
};
