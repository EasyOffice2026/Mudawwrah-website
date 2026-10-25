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

/** True on an Apple device whose browser can pay with Apple Pay (Safari on iPhone, iPad or Mac). */
export const canUseApplePay = () => {
  try {
    return Boolean(window.ApplePaySession?.canMakePayments?.());
  } catch {
    return false;
  }
};
