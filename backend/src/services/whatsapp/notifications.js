import { prisma } from '../../prisma.js';
import { money, t } from './copy.js';
import { sendButtons, sendText } from './waClient.js';

// phone alone is no longer unique — a number can hold an independent session
// with each restaurant it has texted — so this has to be findFirst (which the
// tenant-scoping extension merges tenantId into) rather than findUnique.
const sessionFor = (phone) => prisma.whatsappSession.findFirst({ where: { phone } });

const langFor = async (phone) => (await sessionFor(phone))?.lang || 'en';

/**
 * Notifies the customer about an order status change and asks for feedback on
 * delivery.
 *
 * This used to return early unless the order came from the WhatsApp bot, so a
 * customer who ordered on the website heard nothing after checkout — not even
 * that the kitchen had confirmed it. Every order carries a phone number, so
 * web orders are messaged on the same channel. Sending is a no-op until
 * WhatsApp credentials are configured, which is handled inside the client.
 */
export const notifyStatusChange = async (order) => {
  if (!order.customerPhone) return;
  const lang = await langFor(order.customerPhone);
  const copy = t(lang);
  const message = copy.statusUpdate[order.status];
  if (message) await sendText(order.customerPhone, message(order.orderNumber)).catch(logFailure);
  if (order.status === 'DELIVERED') await requestFeedback(order, lang);
};

/**
 * Alerts the restaurant's own WhatsApp number (Settings → WhatsApp number)
 * the moment any order comes in, regardless of channel or payment method —
 * so staff see it without watching the dashboard. A no-op without that
 * number set, and silent until this restaurant's Meta credentials exist,
 * the same as every other outbound message here.
 */
export const notifyNewOrder = async (order, settings) => {
  const to = settings?.whatsappNumber;
  if (!to) return;
  const lines = order.items
    .map(
      (item) =>
        `• ${item.quantity} × ${item.nameEn}${
          item.customizations?.length ? ` (${item.customizations.map((c) => c.nameEn).join(', ')})` : ''
        } — ${money(item.lineTotal)}`,
    )
    .join('\n');
  // Every other order summary in this app — the customer's cart, the admin
  // ticket — itemises discount/tax/tip rather than folding them silently into
  // one number. Two separate "wrong total" reports were both actually this:
  // a real deduction or add-on with nowhere to show. Same breakdown here.
  const totals = [
    `Subtotal: ${money(order.subtotal)}`,
    Number(order.discount) > 0 ? `Discount (${order.promoCode}): -${money(order.discount)}` : null,
    order.orderType === 'PICKUP' ? null : `Delivery: ${money(order.deliveryFee)}`,
    Number(order.serviceCharge) > 0 ? `Service charge: ${money(order.serviceCharge)}` : null,
    Number(order.tax) > 0 ? `Tax: ${money(order.tax)}` : null,
    Number(order.tip) > 0 ? `Tip: ${money(order.tip)}` : null,
    `Total: ${money(order.total)}`,
  ].filter(Boolean);
  const message = [
    `🔔 New order ${order.orderNumber}`,
    `${order.orderType === 'PICKUP' ? 'Pickup' : 'Delivery'} · ${order.paymentMethod}`,
    '',
    lines,
    '',
    ...totals,
    '',
    `${order.customerName} · ${order.customerPhone}`,
    order.address ? `Address: ${order.address}` : null,
    order.notes ? `Notes: ${order.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  await sendText(to, message).catch(logFailure);
};

export const notifyPaymentResult = async (order, paid) => {
  if (order.channel !== 'WHATSAPP') return;
  const copy = t(await langFor(order.customerPhone));
  await sendText(
    order.customerPhone,
    paid ? copy.orderPaid(order.orderNumber, money(order.total)) : copy.paymentFailed(order.orderNumber),
  ).catch(logFailure);
};

export const requestFeedback = async (order, lang) => {
  const copy = t(lang || (await langFor(order.customerPhone)));
  const existing = await prisma.orderFeedback.findUnique({ where: { orderId: order.id } });
  if (existing) return;
  await sendButtons(order.customerPhone, copy.askRating(order.orderNumber), [
    { id: 'rate:5', title: '⭐⭐⭐⭐⭐' },
    { id: 'rate:3', title: '⭐⭐⭐' },
    { id: 'rate:1', title: '⭐' },
  ]).catch(logFailure);
  const session = await sessionFor(order.customerPhone);
  if (session) {
    await prisma.whatsappSession
      .update({ where: { id: session.id }, data: { state: 'FEEDBACK_RATING', lastOrderId: order.id } })
      .catch(() => {});
  }
};

const logFailure = (error) => console.error('[whatsapp] notification failed', error);
