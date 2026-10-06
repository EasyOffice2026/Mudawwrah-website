import { prisma } from '../prisma.js';
import { dateKey } from './orderNumber.js';

/**
 * Counts one storefront visit (a browser session) on the restaurant's own
 * calendar day, atomically. Only a number per day is kept — nothing about who
 * visited — which is all a visitors-to-orders conversion rate needs.
 */
export const record = async (tenantId, timeZone, now = new Date()) => {
  const day = dateKey(now, timeZone);
  await prisma.$executeRaw`
    INSERT INTO "SiteVisit" ("tenantId", "day", "sessions") VALUES (${tenantId}, ${day}, 1)
    ON CONFLICT ("tenantId", "day") DO UPDATE SET "sessions" = "SiteVisit"."sessions" + 1`;
};
