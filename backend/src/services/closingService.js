import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { createdAtWindow } from './orderDates.js';
import { getAll as getSettings } from './settingService.js';

/** Today's date in the restaurant's own time zone, as YYYY-MM-DD (en-CA formats that way). */
const todayIn = (timeZone, now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);

const round3 = (value) => Number(Number(value).toFixed(3));

const add = (totals, key, amount) => {
  const entry = totals[key] || { count: 0, total: 0 };
  entry.count += 1;
  entry.total = round3(entry.total + amount);
  totals[key] = entry;
};

/**
 * The day's closing sheet: every payment taken online that day, to tick off one by one against the Tap dashboard,
 * with the totals per payment method and per branch. With no KNET slips any more, this is what a branch manager
 * closes the day with.
 *
 * A payment belongs to the day it was taken (paidAt, in the restaurant's time zone), which is how the Tap
 * dashboard lists it too. A payment for an order cancelled afterwards still counts as money taken, and is flagged
 * "refund needed". Orders that day not paid online (before online payment, or during the pilot) are counted
 * apart, so the manager knows they were settled another way.
 *
 * A branch account only ever sees its own branch.
 */
export const closing = async ({ date, branchId } = {}, viewer = null, now = new Date()) => {
  const settings = await getSettings();
  const timeZone = settings.timezone || 'Asia/Kuwait';
  const day = date || todayIn(timeZone, now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'Choose a date as YYYY-MM-DD');
  const window = createdAtWindow(day, day, timeZone);

  const branch = viewer?.role === 'BRANCH' ? viewer.branchId || '00000000-0000-0000-0000-000000000000' : branchId || null;
  const branchWhere = branch ? { branchId: branch } : {};

  const [paid, others] = await Promise.all([
    prisma.order.findMany({
      where: { ...branchWhere, paymentStatus: 'PAID', paidAt: window },
      select: {
        id: true,
        orderNumber: true,
        paidAt: true,
        total: true,
        paymentMethod: true,
        paymentRef: true,
        status: true,
        customerName: true,
        branch: { select: { id: true, nameEn: true, nameAr: true } },
      },
      orderBy: { paidAt: 'asc' },
    }),
    prisma.order.findMany({
      // Still waiting for an online payment (PENDING) is not an order yet; a failed one was cancelled.
      where: { ...branchWhere, paymentStatus: { notIn: ['PAID', 'PENDING'] }, status: { not: 'CANCELLED' }, createdAt: window },
      select: { total: true },
    }),
  ]);

  const byMethod = {};
  const byBranch = {};
  const refundNeeded = { count: 0, total: 0 };
  const payments = paid.map((order) => {
    const amount = Number(order.total);
    add(byMethod, order.paymentMethod, amount);
    const branchKey = order.branch?.id || 'none';
    add(byBranch, branchKey, amount);
    byBranch[branchKey].branch = order.branch || null;
    const refund = order.status === 'CANCELLED';
    if (refund) {
      refundNeeded.count += 1;
      refundNeeded.total = round3(refundNeeded.total + amount);
    }
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      paidAt: order.paidAt,
      amount,
      method: order.paymentMethod,
      reference: order.paymentRef,
      customerName: order.customerName,
      branch: order.branch || null,
      refundNeeded: refund,
    };
  });

  const total = round3(payments.reduce((sum, p) => sum + p.amount, 0));
  return {
    date: day,
    timeZone,
    branchId: branch,
    payments,
    totals: {
      count: payments.length,
      total,
      byMethod,
      byBranch: Object.values(byBranch),
      refundNeeded,
      // What the restaurant keeps of the day's payments once the refunds are made.
      net: round3(total - refundNeeded.total),
    },
    notPaidOnline: { count: others.length, total: round3(others.reduce((sum, o) => sum + Number(o.total), 0)) },
  };
};
