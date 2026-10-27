import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { branchFor, dayWindow } from './closingService.js';
import { getProvider, handleCallback, isOnlinePaymentEnabled } from './payment/index.js';

// Our "paid" time is when Tap told us, a moment after Tap's own charge time; a payment just before midnight can be
// on either side of the line. Tap is asked for a little more than the day, and only what concerns the day is kept.
const MARGIN_MS = 60 * 60 * 1000;
const sameMoney = (a, b) => Math.abs(Number(a) - Number(b)) < 0.0005;
const inDay = (moment, window) => moment && moment >= window.gte && moment < window.lt;

/**
 * The day's payments checked against Tap itself, so closing the day does not depend on ticking lines by hand.
 *
 * - matched: paid here and captured by Tap, same amount.
 * - amountDiffers: both sides have it, with different amounts.
 * - notPaidHere: Tap captured it, but the order here is not marked paid (the payment notice never arrived). The
 *   owner can record it: the payment is read back from Tap first, exactly as if the notice had arrived.
 * - notInTap: marked paid here, but Tap has no captured payment for it that day.
 * - unknown: captured by Tap with no order here at all (another system using the same Tap account, a test).
 *   Only shown when looking at every branch, since it cannot be put in any branch.
 *
 * A branch account sees its own branch only, like the closing sheet.
 */
export const reconcile = async ({ date, branchId } = {}, viewer = null, now = new Date()) => {
  const { day, window } = await dayWindow(date, now);
  const branch = branchFor(viewer, branchId);
  const provider = getProvider();
  if (!isOnlinePaymentEnabled() || provider?.name !== 'tap') return { date: day, available: false };

  let charges;
  try {
    charges = await provider.capturedCharges({
      from: new Date(window.gte.getTime() - MARGIN_MS),
      to: new Date(window.lt.getTime() + MARGIN_MS),
    });
  } catch (error) {
    throw new HttpError(502, `Tap could not be reached to check the payments (${error.message.replace(/^Tap request failed: /, '')})`);
  }

  const [paidHere, byCharge] = await Promise.all([
    prisma.order.findMany({
      where: { ...(branch ? { branchId: branch } : {}), paymentStatus: 'PAID', paidAt: window, paymentProvider: 'tap' },
      select: { id: true, orderNumber: true, total: true, paymentRef: true, paidAt: true, branchId: true },
    }),
    prisma.order.findMany({
      where: { OR: [{ paymentRef: { in: charges.map((c) => c.id) } }, { orderNumber: { in: charges.map((c) => c.orderNumber).filter(Boolean) } }] },
      select: { id: true, orderNumber: true, total: true, paymentRef: true, paymentStatus: true, status: true, branchId: true },
    }),
  ]);

  const chargeById = new Map(charges.map((c) => [c.id, c]));
  const orderFor = (charge) => byCharge.find((o) => o.paymentRef === charge.id) || byCharge.find((o) => o.orderNumber === charge.orderNumber);
  const mine = (order) => !branch || order?.branchId === branch;

  const matched = [];
  const amountDiffers = [];
  const notInTap = [];
  for (const order of paidHere) {
    const charge = chargeById.get(order.paymentRef);
    const row = { orderNumber: order.orderNumber, reference: order.paymentRef, amount: Number(order.total) };
    if (!charge) notInTap.push(row);
    else if (!sameMoney(charge.amount, order.total)) amountDiffers.push({ ...row, tapAmount: charge.amount });
    else matched.push(row);
  }

  const notPaidHere = [];
  const unknown = [];
  for (const charge of charges) {
    if (!inDay(charge.createdAt, window)) continue;
    const order = orderFor(charge);
    const row = { reference: charge.id, amount: charge.amount, method: charge.method, at: charge.createdAt };
    if (!order) {
      if (!branch) unknown.push({ ...row, orderNumber: charge.orderNumber });
    } else if (order.paymentStatus !== 'PAID' && mine(order)) {
      notPaidHere.push({ ...row, orderNumber: order.orderNumber, status: order.status });
    }
  }

  return {
    date: day,
    available: true,
    checkedAt: now.toISOString(),
    ok: !amountDiffers.length && !notInTap.length && !notPaidHere.length && !unknown.length,
    matched,
    amountDiffers,
    notInTap,
    notPaidHere,
    unknown,
  };
};

/**
 * Records a payment Tap captured but whose notice never reached us, by running the same check as the notice:
 * Tap is asked for the charge with the restaurant's key, and only a captured charge for this order's total
 * marks it paid (and sends it to the kitchen's printer).
 */
export const recordMissedPayment = async (reference) => {
  const order = await prisma.order.findFirst({ where: { paymentRef: String(reference), paymentProvider: 'tap' } });
  if (!order) throw new HttpError(404, 'No order of this restaurant has that Tap payment');
  return handleCallback('tap', { tap_id: String(reference) });
};
