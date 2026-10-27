import { config } from '../../config.js';
import { currentTenant } from '../../tenantContext.js';
import { open } from '../secretBox.js';

// Tap Payments (https://developers.tap.company): a hosted checkout page that offers KNET, Visa,
// Mastercard, Apple Pay and Google Pay. The customer is sent to Tap with a charge, comes back to
// our redirect, and Tap also posts the result to the same address. Either way the status is read
// back from Tap with the secret key, so a forged callback changes nothing.

/**
 * The Tap key for a restaurant: its own (each restaurant can hold its own Tap account), else the platform's
 * TAP_SECRET_KEY. Which restaurants may use the platform's key at all is decided in payment/index.js.
 */
export const ownKeyOf = (tenant) => open(tenant?.tapSecretKey);
export const secretKeyFor = (tenant) => ownKeyOf(tenant) || config.payment.tap.secretKey;

const request = async (method, path, body, secretKey = secretKeyFor(currentTenant())) => {
  const { baseUrl } = config.payment.tap;
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

export const isConfigured = () => Boolean(secretKeyFor(currentTenant()));

/**
 * Checks a secret key with Tap before it is saved: a wrong key would only show itself when a customer pays.
 * Listing one charge is the cheapest call that needs a valid key.
 */
export const verifyKey = async (secretKey) => {
  await request('POST', '/v2/charges/list', { limit: 1 }, secretKey);
  return true;
};

/**
 * Every charge Tap captured between two moments, for the daily reconciliation. Tap returns pages of up to 50;
 * all pages are read (a day of a restaurant is a few hundred at most; the cap only guards against a loop).
 */
export const capturedCharges = async ({ from, to }) => {
  const charges = [];
  let after;
  for (let page = 0; page < 40; page += 1) {
    const body = {
      period: { date: { from: String(from.getTime()), to: String(to.getTime()) }, type: 'CHARGE' },
      status: 'CAPTURED',
      limit: 50,
      ...(after ? { starting_after: after } : {}),
    };
    const data = await request('POST', '/v2/charges/list', body);
    const batch = data?.charges || [];
    charges.push(
      ...batch.map((charge) => ({
        id: String(charge.id),
        amount: Number(charge.amount),
        currency: charge.currency,
        orderNumber: charge.reference?.order || null,
        createdAt: charge.transaction?.created ? new Date(Number(charge.transaction.created)) : null,
        method: methodFor(charge),
      })),
    );
    if (!data?.has_more || !batch.length) break;
    after = batch[batch.length - 1].id;
  }
  return charges;
};

// Tap wants the phone without the country code, as digits.
const localPhone = (phone) => String(phone).replace(/\D/g, '').replace(/^965/, '').slice(-8);

// The customer already chose how to pay on our checkout, so Tap opens that method's page directly instead of
// asking again: KNET goes straight to the KNET page, a card to Tap's card form (Visa, Mastercard, AMEX).
// Apple Pay, and anything else, gets Tap's page with every method the merchant has, where Apple Pay is offered
// on Apple devices.
const SOURCES = { KNET: 'src_kw.knet', CARD: 'src_card' };
export const sourceFor = (paymentMethod) => SOURCES[String(paymentMethod || '').toUpperCase()] || 'src_all';

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
    source: { id: sourceFor(order.paymentMethod) },
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

// How Tap names what the customer paid with, as our payment methods. Google Pay is a card payment.
const METHODS = { KNET: 'KNET', VISA: 'CARD', MASTERCARD: 'CARD', AMERICAN_EXPRESS: 'CARD', AMEX: 'CARD', MADA: 'CARD', MEEZA: 'CARD', APPLE_PAY: 'APPLE_PAY', GOOGLE_PAY: 'CARD' };
const clean = (value) => String(value || '').toUpperCase().replace(/[\s-]+/g, '_');

/** The payment method a captured charge was made with, or null when Tap does not say. */
export const methodFor = (charge) =>
  METHODS[clean(charge?.source?.type)] || METHODS[clean(charge?.source?.payment_method)] || METHODS[clean(charge?.card?.brand)] || null;

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
    method: methodFor(charge),
    raw: charge,
  };
};
