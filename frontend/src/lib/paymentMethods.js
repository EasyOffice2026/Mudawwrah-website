/**
 * Which ways to pay the checkout offers.
 *
 * The restaurant's own setting decides (a shop that takes no cash never shows it), in the order it lists them,
 * and Apple Pay is only offered on a device that can actually use it: anywhere else it would send the customer
 * to a payment page with nothing to tap.
 */
const KNOWN = ['KNET', 'CARD', 'APPLE_PAY', 'CASH'];

export const offeredPayments = (setting, { applePay = false } = {}) =>
  String(setting || 'KNET,CARD')
    .split(',')
    .map((method) => method.trim().toUpperCase())
    .filter((method, index, all) => KNOWN.includes(method) && all.indexOf(method) === index)
    .filter((method) => method !== 'APPLE_PAY' || applePay);

/**
 * The choices shown at checkout, as on the payment page: a card is offered twice, as "Credit Card" (Visa,
 * Mastercard) and "American Express". Both are paid through the same card form, so both are a CARD order.
 */
export const paymentChoices = (methods) => methods.flatMap((method) => (method === 'CARD' ? ['CARD', 'AMEX'] : [method]));

/** The order's payment method for a checkout choice. */
export const methodOfChoice = (choice) => (choice === 'AMEX' ? 'CARD' : choice);

/** True on an Apple device whose browser can pay with Apple Pay (Safari on iPhone, iPad or Mac). */
export const canUseApplePay = () => {
  try {
    return Boolean(window.ApplePaySession?.canMakePayments?.());
  } catch {
    return false;
  }
};
