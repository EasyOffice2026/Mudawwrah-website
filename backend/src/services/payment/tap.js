import { config } from '../../config.js';

// Tap Payments (https://developers.tap.company): a hosted checkout page that offers KNET, Visa,
// Mastercard, Apple Pay and Google Pay. The customer is sent to Tap with a charge, comes back to
// our redirect, and Tap also posts the result to the same address. Either way the status is read
// back from Tap with the secret key, so a forged callback changes nothing.

const request = async (method, path, body) => {
  const { secretKey, baseUrl } = config.payment.tap;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors?.[0]?.description || data?.message || `status ${response.status}`;
    throw new Error(`Tap request failed: ${detail}`);
  }
  return data;
};

export const name = 'tap';

export const isConfigured = () => Boolean(config.payment.tap.secretKey);

// Tap wants the phone without the country code, as digits.
const localPhone = (phone) => String(phone).replace(/\D/g, '').replace(/^965/, '').slice(-8);

export const createPaymentLink = async ({ order, lang, callbackUrl }) => {
  const { merchantId, currency } = config.payment.tap;
  const [firstName, ...rest] = String(order.customerName || 'Customer').trim().split(/\s+/);
  const charge = await request('POST', '/v2/charges', {
    // KWD has three decimals, which Tap accepts as a number.
    amount: Number(Number(order.total).toFixed(3)),
    currency,
    customer_initiated: true,
    threeDSecure: true,
    save_card: false,
    description: `Order ${order.orderNumber}`,
    reference: { transaction: `txn_${order.id}`, order: order.orderNumber },
    receipt: { email: false, sms: false },
    customer: {
      first_name: firstName,
      ...(rest.length ? { last_name: rest.join(' ') } : {}),
      phone: { country_code: '965', number: localPhone(order.customerPhone) },
    },
    // Every method Tap has enabled for the merchant (KNET, cards, Apple Pay, Google Pay).
    source: { id: 'src_all' },
    ...(merchantId ? { merchant: { id: merchantId } } : {}),
    post: { url: callbackUrl },
    redirect: { url: callbackUrl },
    // The language of the hosted page.
    metadata: { udf1: lang === 'ar' ? 'ar' : 'en' },
  });
  const url = charge?.transaction?.url;
  if (!charge?.id || !url) throw new Error('Tap did not return a payment page');
  return { url, reference: String(charge.id) };
};

// Statuses at which the money will not come: the customer left, cancelled, or the bank refused.
const FAILED = ['ABANDONED', 'CANCELLED', 'FAILED', 'DECLINED', 'RESTRICTED', 'VOID', 'TIMEDOUT'];

/** Reads the charge from Tap itself. Only CAPTURED means the money was taken. */
export const getPaymentStatus = async ({ paymentId }) => {
  const charge = await request('GET', `/v2/charges/${encodeURIComponent(paymentId)}`);
  const status = String(charge.status || '').toUpperCase();
  return {
    reference: String(charge.id),
    paid: status === 'CAPTURED',
    failed: FAILED.includes(status),
    // What was charged, so the caller can check it against the order.
    amount: Number(charge.amount),
    currency: charge.currency,
    raw: charge,
  };
};
