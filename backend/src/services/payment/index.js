import { config } from '../../config.js';
import { HttpError } from '../../middleware/error.js';
import { prisma } from '../../prisma.js';
import * as mock from './mock.js';
import * as myfatoorah from './myfatoorah.js';

const providers = { myfatoorah, mock };

export const getProvider = (name = config.payment.provider) => providers[name] || null;

export const isOnlinePaymentEnabled = () => {
  const provider = getProvider();
  return Boolean(provider && provider.isConfigured());
};

const callbackUrl = (provider) => `${config.publicUrl}/api/payments/${provider.name}/callback`;

/** Creates a hosted payment link for an order and stores the provider reference on it. */
export const startPayment = async (order, lang = 'en') => {
  const provider = getProvider();
  if (!provider || !provider.isConfigured()) return null;
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
  const paymentId = query.paymentId || query.PaymentId || query.ref || null;
  const invoiceId = query.invoiceId || query.InvoiceId || query.Id || null;
  if (!paymentId && !invoiceId) throw new HttpError(400, 'Missing payment reference');

  const status = await provider.getPaymentStatus({ paymentId, invoiceId });
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

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: status.paid
      ? { paymentStatus: 'PAID', paidAt: new Date(), status: order.status === 'PENDING' ? 'CONFIRMED' : order.status }
      : { paymentStatus: 'FAILED' },
    include: { items: true },
  });
  return { order: updated, paid: status.paid, failed: status.failed };
};
