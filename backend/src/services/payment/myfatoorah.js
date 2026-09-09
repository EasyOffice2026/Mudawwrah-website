import { config } from '../../config.js';

const request = async (path, body) => {
  const { apiKey, baseUrl } = config.payment.myfatoorah;
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.IsSuccess === false) {
    throw new Error(data.Message || `MyFatoorah request failed with status ${response.status}`);
  }
  return data.Data ?? data;
};

export const name = 'myfatoorah';

export const isConfigured = () => Boolean(config.payment.myfatoorah.apiKey);

export const createPaymentLink = async ({ order, lang, callbackUrl }) => {
  const data = await request('/v2/SendPayment', {
    CustomerName: order.customerName,
    NotificationOption: 'LNK',
    InvoiceValue: Number(order.total),
    DisplayCurrencyIso: config.payment.myfatoorah.currency,
    CustomerMobile: String(order.customerPhone).replace(/^965/, '').replace(/\D/g, '').slice(-8),
    MobileCountryCode: '+965',
    Language: lang === 'ar' ? 'ar' : 'en',
    CustomerReference: order.orderNumber,
    CallBackUrl: callbackUrl,
    ErrorUrl: callbackUrl,
  });
  return { url: data.InvoiceURL, reference: String(data.InvoiceId) };
};

/** Confirms payment state directly with MyFatoorah so callbacks cannot be spoofed. */
export const getPaymentStatus = async ({ paymentId, invoiceId }) => {
  const data = await request('/v2/GetPaymentStatus', paymentId
    ? { Key: paymentId, KeyType: 'PaymentId' }
    : { Key: String(invoiceId), KeyType: 'InvoiceId' });
  const status = String(data.InvoiceStatus || '').toLowerCase();
  return {
    reference: String(data.InvoiceId),
    paid: status === 'paid',
    failed: ['failed', 'canceled', 'cancelled', 'expired'].includes(status),
    raw: data,
  };
};
