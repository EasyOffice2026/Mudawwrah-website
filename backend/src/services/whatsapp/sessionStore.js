import { config } from '../../config.js';
import { prisma } from '../../prisma.js';

const isExpired = (session) =>
  Date.now() - new Date(session.updatedAt).getTime() > config.whatsapp.sessionTtlMinutes * 60 * 1000;

/** Loads the conversation state for a phone number, resetting it once it goes stale. */
export const load = async (phone, waName) => {
  const existing = await prisma.whatsappSession.findUnique({ where: { phone } });
  if (!existing) {
    return prisma.whatsappSession.create({ data: { phone, waName, state: 'START', cart: [], draft: {} } });
  }
  if (isExpired(existing) && !['START', 'LANG'].includes(existing.state)) {
    return prisma.whatsappSession.update({
      where: { phone },
      data: { state: 'MENU', cart: [], draft: {}, waName: waName || existing.waName },
    });
  }
  if (waName && waName !== existing.waName) {
    return prisma.whatsappSession.update({ where: { phone }, data: { waName } });
  }
  return existing;
};

export const save = (phone, data) => prisma.whatsappSession.update({ where: { phone }, data });

export const reset = (phone, extra = {}) =>
  prisma.whatsappSession.update({ where: { phone }, data: { state: 'MENU', cart: [], draft: {}, ...extra } });
