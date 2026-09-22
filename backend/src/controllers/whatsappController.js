import { config } from '../config.js';
import { prisma } from '../prisma.js';
import { runWithTenant } from '../tenantContext.js';
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
 * Which restaurant this message belongs to.
 *
 * Meta delivers every restaurant's messages to the same webhook URL — there
 * is no per-tenant endpoint the way the web app gets one via /r/:slug — so
 * the only real signal is which of the business's WhatsApp numbers actually
 * received it. That is exactly the customDomain pattern applied to phone
 * numbers instead of hostnames: a restaurant with none configured here
 * simply never resolves, and its bot stays silent rather than accidentally
 * answering as a different restaurant.
 */
const resolveTenantForNumber = (phoneNumberId) => {
  if (!phoneNumberId) return null;
  return prisma.tenant.findFirst({ where: { whatsappPhoneNumberId: phoneNumberId, isActive: true } });
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
      const tenant = await resolveTenantForNumber(value.metadata?.phone_number_id);
      if (!tenant) {
        console.error(
          '[whatsapp] no restaurant is configured for phone_number_id',
          value.metadata?.phone_number_id,
          '— add it under that restaurant in the platform console',
        );
        continue;
      }
      for (const message of value.messages || []) {
        try {
          // Everything downstream — every menu lookup, the session, the
          // order it eventually places — runs inside this one restaurant's
          // context, the same AsyncLocalStorage scope resolveTenant opens
          // for a normal web request.
          await runWithTenant(tenant, () => processMessage(message, value));
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
