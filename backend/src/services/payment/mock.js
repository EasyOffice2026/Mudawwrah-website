import { config } from '../../config.js';

/** Development provider: the returned link marks the order paid when opened. */
export const name = 'mock';

export const isConfigured = () => true;

export const createPaymentLink = async ({ order }) => ({
  url: `${config.publicUrl}/api/payments/mock/pay?ref=${order.orderNumber}`,
  reference: order.orderNumber,
});

export const getPaymentStatus = async ({ paymentId, invoiceId }) => ({
  reference: String(paymentId || invoiceId),
  paid: true,
  failed: false,
  raw: { provider: 'mock' },
});
