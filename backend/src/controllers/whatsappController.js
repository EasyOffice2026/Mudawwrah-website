import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { handleInbound } from '../services/whatsapp/flow.js';
import { markAsRead, verifySignature } from '../services/whatsapp/waClient.js';

export const verify = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  if (mode === 'subscribe' && token && token === config.whatsapp.verifyToken) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
};

const extractInput = (message) => {
  if (message.type === 'text') return { text: message.text?.body };
  if (message.type === 'interactive') {
    const interactive = message.interactive;
    if (interactive?.type === 'button_reply') {
      return { replyId: interactive.button_reply.id, text: interactive.button_reply.title };
    }
    if (interactive?.type === 'list_reply') {
      return { replyId: interactive.list_reply.id, text: interactive.list_reply.title };
    }
  }
  if (message.type === 'button') return { text: message.button?.text };
  return { text: '' };
};

/**
 * Meta always expects a 200 here, so messages are acknowledged first and processed
 * afterwards; failures are logged rather than retried by Meta.
 */
export const receive = async (req, res) => {
  if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  res.sendStatus(200);

  const entries = req.body?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const message of value.messages || []) {
        try {
          await processMessage(message, value);
        } catch (error) {
          console.error('[whatsapp] failed to process message', error);
        }
      }
    }
  }
};

const processMessage = async (message, value) => {
  const phone = message.from;
  const waName = value.contacts?.find((c) => c.wa_id === phone)?.profile?.name;
  const logged = await prisma.whatsappMessage
    .create({
      data: {
        phone,
        direction: 'INBOUND',
        waMessageId: message.id,
        body: extractInput(message).text || null,
        payload: message,
      },
    })
    .catch(() => null);
  if (!logged) return; // duplicate delivery of an already-processed message

  await markAsRead(message.id);
  await handleInbound({ phone, waName, ...extractInput(message) });
};
