import { config } from '../../config.js';
import { prisma } from '../../prisma.js';

const isExpired = (session) =>
  Date.now() - new Date(session.updatedAt).getTime() > config.whatsapp.sessionTtlMinutes * 60 * 1000;

/**
 * WhatsappSession is tenant-scoped, but phone alone is never unique anymore —
 * the same number can hold an independent session with each restaurant it
 * texts. findFirst (rather than findUnique) is what lets the tenant-scoping
 * extension merge tenantId into this lookup; save/reset below then update by
 * the row's own id, never by phone directly, which is what makes it safe for
 * WhatsappSession to sit in the auto-scoped set at all despite phone no
 * longer being a real unique key.
 */
const findOwn = (phone) => prisma.whatsappSession.findFirst({ where: { phone } });

/** Loads the conversation state for a phone number, resetting it once it goes stale. */
export const load = async (phone, waName) => {
  const existing = await findOwn(phone);
  if (!existing) {
    return prisma.whatsappSession.create({ data: { phone, waName, state: 'START', cart: [], draft: {} } });
  }
  if (isExpired(existing) && !['START', 'LANG'].includes(existing.state)) {
    return prisma.whatsappSession.update({
      where: { id: existing.id },
      data: { state: 'MENU', cart: [], draft: {}, waName: waName || existing.waName },
    });
  }
  if (waName && waName !== existing.waName) {
    return prisma.whatsappSession.update({ where: { id: existing.id }, data: { waName } });
  }
  return existing;
};

export const save = async (phone, data) => {
  const existing = await findOwn(phone);
  if (!existing) throw new Error(`No WhatsApp session for ${phone} in the current restaurant`);
  return prisma.whatsappSession.update({ where: { id: existing.id }, data });
};

export const reset = async (phone, extra = {}) => {
  const existing = await findOwn(phone);
  if (!existing) throw new Error(`No WhatsApp session for ${phone} in the current restaurant`);
  return prisma.whatsappSession.update({ where: { id: existing.id }, data: { state: 'MENU', cart: [], draft: {}, ...extra } });
};
