import { prisma } from '../../prisma.js';
import { money, t } from './copy.js';
import { sendButtons, sendText } from './waClient.js';

const sessionFor = (phone) => prisma.whatsappSession.findUnique({ where: { phone } });

const langFor = async (phone) => (await sessionFor(phone))?.lang || 'en';

/** Notifies a WhatsApp customer about an order status change and asks for feedback on delivery. */
export const notifyStatusChange = async (order) => {
  if (order.channel !== 'WHATSAPP') return;
  const lang = await langFor(order.customerPhone);
  const copy = t(lang);
  const message = copy.statusUpdate[order.status];
  if (message) await sendText(order.customerPhone, message(order.orderNumber)).catch(logFailure);
  if (order.status === 'DELIVERED') await requestFeedback(order, lang);
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
  await prisma.whatsappSession
    .update({ where: { phone: order.customerPhone }, data: { state: 'FEEDBACK_RATING', lastOrderId: order.id } })
    .catch(() => {});
};

const logFailure = (error) => console.error('[whatsapp] notification failed', error);
