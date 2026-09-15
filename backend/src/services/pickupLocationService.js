import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';

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
    return { day, closed, open, close };
  });
};

const shape = (data) => ({
  ...data,
  ...(data.hours !== undefined ? { hours: normaliseHours(data.hours) } : {}),
});

/** Public: only branches a customer could actually collect from today. */
export const listPublic = () =>
  prisma.pickupLocation.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });

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
