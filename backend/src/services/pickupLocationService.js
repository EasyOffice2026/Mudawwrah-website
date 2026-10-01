import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { isOpenAt, nextOpening } from './branchHours.js';
import { getAll as getSettings } from './settingService.js';

/**
 * Branches a customer can collect from, and when each one is open.
 *
 * Every query goes through the tenant-scoped client, so a restaurant only ever
 * sees and edits its own branches.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Normalises the weekly opening hours.
 *
 * Always returns seven entries, one per weekday, whatever the caller sent —
 * a partial week would leave the storefront unable to answer "can I collect on
 * Tuesday?" without guessing. Days are 0=Sunday, matching Date#getDay so no
 * conversion is needed when the storefront checks today.
 */
export const normaliseHours = (input) => {
  const provided = new Map(
    (Array.isArray(input) ? input : []).filter((row) => Number.isInteger(row?.day)).map((row) => [row.day, row]),
  );

  return Array.from({ length: 7 }, (_, day) => {
    const row = provided.get(day) || {};
    const closed = Boolean(row.closed);
    const open = HHMM.test(row.open) ? row.open : '09:00';
    const close = HHMM.test(row.close) ? row.close : '23:00';
    // A window that ends before it starts is a branch trading past midnight,
    // which is normal here — it is stored as given and read as wrapping.
    // Equal open and close means open all day.
    // Breaks close the branch for part of the day (Friday prayer); malformed ones are dropped.
    const breaks = (Array.isArray(row.breaks) ? row.breaks : [])
      .filter((b) => HHMM.test(b?.from) && HHMM.test(b?.to) && b.from !== b.to)
      .slice(0, 4)
      .map((b) => ({ from: b.from, to: b.to }));
    return { day, closed, open, close, breaks };
  });
};

/** Static IPs, trimmed and de-duplicated; IPv4 or IPv6 literals only. */
const normaliseIps = (ips) => [
  ...new Set((Array.isArray(ips) ? ips : []).map((ip) => String(ip).trim()).filter((ip) => /^[0-9a-fA-F:.]{2,45}$/.test(ip))),
];

const shape = (data) => ({
  ...data,
  ...(data.hours !== undefined ? { hours: normaliseHours(data.hours) } : {}),
  ...(data.allowedIps !== undefined ? { allowedIps: normaliseIps(data.allowedIps) } : {}),
});

/** Adds openNow and nextOpen ({ time, daysAhead }) in the restaurant's timezone. */
export const withOpenStatus = async (branches, now = new Date()) => {
  const { timezone } = await getSettings();
  return branches.map((branch) => ({
    ...branch,
    openNow: isOpenAt(branch.hours, now, timezone || 'Asia/Kuwait'),
    nextOpen: isOpenAt(branch.hours, now, timezone || 'Asia/Kuwait') ? null : nextOpening(branch.hours, now, timezone || 'Asia/Kuwait'),
  }));
};

/** Public: active branches with their open status. Staff IP lists never leave the server here. */
export const listPublic = async () => {
  const branches = await prisma.pickupLocation.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return withOpenStatus(branches.map(({ allowedIps, ...branch }) => branch));
};

/** Admin: everything, including branches temporarily switched off. */
export const listAll = () =>
  prisma.pickupLocation.findMany({ orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] });

export const getById = async (id) => {
  const location = await prisma.pickupLocation.findUnique({ where: { id } });
  if (!location) throw new HttpError(404, 'Pickup location not found');
  return location;
};

export const create = (data) => prisma.pickupLocation.create({ data: shape({ ...data, hours: data.hours ?? [] }) });

export const update = async (id, data) => {
  await getById(id); // 404 rather than a Prisma error, and confirms the tenant owns it
  return prisma.pickupLocation.update({ where: { id }, data: shape(data) });
};

export const remove = async (id) => {
  await getById(id);
  // Orders keep pointing at a removed branch via SetNull, so history survives.
  await prisma.pickupLocation.delete({ where: { id } });
  return { ok: true };
};

export const reorder = async (orderedIds) => {
  const owned = await prisma.pickupLocation.findMany({ where: { id: { in: orderedIds } }, select: { id: true } });
  if (owned.length !== orderedIds.length) throw new HttpError(400, 'Unknown pickup location in the list');
  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.pickupLocation.update({ where: { id }, data: { displayOrder: index } })),
  );
  return listAll();
};
