import crypto from 'crypto';
import { config, isWhatsappConfigured } from '../../config.js';
import { prisma } from '../../prisma.js';

const graphUrl = () =>
  `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;

const logOutbound = (phone, payload) =>
  prisma.whatsappMessage
    .create({ data: { phone, direction: 'OUTBOUND', body: describe(payload), payload } })
    .catch((err) => console.error('failed to log outbound whatsapp message', err));

const describe = (payload) => {
  if (payload.type === 'text') return payload.text?.body;
  if (payload.type === 'interactive') return payload.interactive?.body?.text;
  return payload.type;
};

const send = async (payload) => {
  await logOutbound(payload.to, payload);
  if (!isWhatsappConfigured()) {
    console.warn('[whatsapp] not configured — message not delivered:', describe(payload));
    return { skipped: true };
  }
  const response = await fetch(graphUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[whatsapp] send failed', response.status, JSON.stringify(body));
    throw new Error(body?.error?.message || `WhatsApp send failed with status ${response.status}`);
  }
  return body;
};

export const sendText = (to, text, previewUrl = false) =>
  send({ to, type: 'text', text: { body: truncate(text, 4096), preview_url: previewUrl } });

/** Up to 3 buttons; each id must be <= 256 chars and title <= 20 chars. */
export const sendButtons = (to, text, buttons, { header, footer } = {}) =>
  send({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(header ? { header: { type: 'text', text: truncate(header, 60) } } : {}),
      body: { text: truncate(text, 1024) },
      ...(footer ? { footer: { text: truncate(footer, 60) } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: truncate(b.title, 20) },
        })),
      },
    },
  });

/** Sections of rows; WhatsApp allows at most 10 rows in total across sections. */
export const sendList = (to, { text, buttonLabel, sections, header, footer }) =>
  send({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      ...(header ? { header: { type: 'text', text: truncate(header, 60) } } : {}),
      body: { text: truncate(text, 1024) },
      ...(footer ? { footer: { text: truncate(footer, 60) } } : {}),
      action: {
        button: truncate(buttonLabel, 20),
        sections: sections.map((section) => ({
          title: truncate(section.title, 24),
          rows: section.rows.map((row) => ({
            id: row.id,
            title: truncate(row.title, 24),
            ...(row.description ? { description: truncate(row.description, 72) } : {}),
          })),
        })),
      },
    },
  });

export const sendImage = (to, link, caption) =>
  send({ to, type: 'image', image: { link, ...(caption ? { caption: truncate(caption, 1024) } : {}) } });

export const markAsRead = async (messageId) => {
  if (!isWhatsappConfigured() || !messageId) return;
  await fetch(graphUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
  }).catch((err) => console.error('[whatsapp] mark as read failed', err));
};

export const verifySignature = (rawBody, signatureHeader) => {
  if (!config.whatsapp.appSecret) return true;
  if (!signatureHeader || !rawBody) return false;
  const expected = `sha256=${crypto.createHmac('sha256', config.whatsapp.appSecret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const truncate = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
