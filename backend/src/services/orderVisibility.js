/**
 * An order placed with online payment is not the restaurant's until the gateway says it is paid.
 *
 * While it waits (paymentStatus PENDING) staff never see it, it makes no sound, and it counts in no
 * sales figure. Otherwise a customer who closes the payment page would leave an order behind that
 * the kitchen cooks for nothing. Only the Payments report still reads these, as "abandoned".
 */
export const hiddenWhileUnpaid = { paymentStatus: { not: 'PENDING' } };

export const isAwaitingPayment = (order) => order?.paymentStatus === 'PENDING';

/**
 * Orders that reached the restaurant after `since`. An online order arrives when it is paid, not
 * when the customer started it, so a payment that takes a few minutes still makes the sound.
 */
export const arrivedAfter = (since) => ({
  OR: [{ paidAt: null, createdAt: { gt: since } }, { paidAt: { gt: since } }],
});
