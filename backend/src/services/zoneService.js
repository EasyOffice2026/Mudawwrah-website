import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { withOpenStatus } from './pickupLocationService.js';

/**
 * Delivery zones: the areas a restaurant delivers to and the branch serving each.
 *
 * Once a restaurant has any active zone, every delivery order must fall in one,
 * and that zone's branch must be open — otherwise the order is refused. The
 * client chose rejection over sending the order to another branch.
 * A restaurant with no zones keeps the old behaviour (one fee, any address).
 *
 * The exception is an area the owner lists under more than one branch (e.g.
 * Sabah Al-Ahmad: its own branch 04:00–16:00, Al Aqeelah the rest of the day).
 * Those zones share a name; the lowest display order serves it while open, the
 * next one takes over when it is closed. Customers only ever see one entry.
 */

const branchSelect = { id: true, nameEn: true, nameAr: true, isActive: true, hours: true, prepMinutes: true };
const orderBy = [{ displayOrder: 'asc' }, { nameEn: 'asc' }];

const normalise = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/^(ال|al[\s-]+|el[\s-]+)/, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, '');

const zoneOrder = (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || new Date(a.createdAt) - new Date(b.createdAt);
const money = (value) => (value === null || value === undefined ? null : Number(value));
const present = (zone) => ({ ...zone, deliveryFee: money(zone.deliveryFee), minimumOrder: money(zone.minimumOrder) });

/** Admin: every zone with its branch. */
export const listAll = async () => (await prisma.deliveryZone.findMany({ orderBy, include: { branch: { select: branchSelect } } })).map(present);

/**
 * Active zones of active branches with their branch's open status, and for an
 * area listed under several branches only the one serving it right now: the
 * first open one in display order, or the first one when all are closed.
 */
const servingZones = async (now = new Date()) => {
  const zones = await prisma.deliveryZone.findMany({ where: { isActive: true }, orderBy, include: { branch: { select: branchSelect } } });
  const live = zones.filter((z) => z.branch?.isActive);
  const branches = await withOpenStatus([...new Map(live.map((z) => [z.branch.id, z.branch])).values()], now);
  const byId = new Map(branches.map((b) => [b.id, b]));
  const groups = new Map();
  for (const zone of live) {
    const key = normalise(zone.nameEn);
    groups.set(key, [...(groups.get(key) || []), { ...zone, branch: byId.get(zone.branch.id) }]);
  }
  const serving = new Map();
  for (const [key, group] of groups) {
    const ranked = [...group].sort(zoneOrder);
    serving.set(key, ranked.find((z) => z.branch.openNow) || ranked[0]);
  }
  // Keep the list order (display order, then name), one entry per area.
  return live.filter((z) => serving.get(normalise(z.nameEn)).id === z.id).map((z) => serving.get(normalise(z.nameEn)));
};

/** Public (checkout and WhatsApp): one entry per area, with the branch serving it now and its open status. */
export const listPublic = async () =>
  (await servingZones()).map(({ branch: { hours, ...branch }, ...zone }) => present({ ...zone, branch }));

const ensureBranch = async (branchId) => {
  // Tenant-scoped read: another restaurant's branch is simply not found.
  const branch = await prisma.pickupLocation.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) throw new HttpError(400, 'That branch does not exist');
};

export const getById = async (id) => {
  const zone = await prisma.deliveryZone.findUnique({ where: { id }, include: { branch: { select: branchSelect } } });
  if (!zone) throw new HttpError(404, 'Delivery zone not found');
  return present(zone);
};

export const create = async (data) => {
  await ensureBranch(data.branchId);
  return present(await prisma.deliveryZone.create({ data }));
};

export const update = async (id, data) => {
  await getById(id);
  if (data.branchId) await ensureBranch(data.branchId);
  return present(await prisma.deliveryZone.update({ where: { id }, data }));
};

export const remove = async (id) => {
  await getById(id);
  // Past orders keep their history: Order.zoneId is SetNull.
  await prisma.deliveryZone.delete({ where: { id } });
};

/**
 * The zone and branch a delivery order belongs to, or null when the restaurant
 * has no zones (old behaviour). Throws 422 when the area is not covered and
 * 409 when its branch is inactive or closed right now.
 */
export const resolveForDelivery = async ({ zoneId, area }, { now = new Date() } = {}) => {
  const zones = await prisma.deliveryZone.findMany({ where: { isActive: true }, include: { branch: { select: branchSelect } } });
  if (!zones.length) return null;

  // Typed areas are matched loosely: case, "Al-" prefixes and Arabic letter forms do not matter.
  const picked = zoneId ? zones.find((z) => z.id === zoneId) : zones.find((z) => [z.nameEn, z.nameAr].some((n) => n && normalise(n) === normalise(area)));
  if (!picked) throw new HttpError(422, area ? `Sorry, we do not deliver to ${area} yet` : 'Please choose your delivery area');

  // Whichever branch serves that area right now, even if the customer's screen showed another one.
  const zone = (await servingZones(now)).find((z) => normalise(z.nameEn) === normalise(picked.nameEn));
  if (!zone) throw new HttpError(409, `Delivery to ${picked.nameEn} is not available right now`);

  const { branch } = zone;
  if (!branch.openNow) {
    const opens = branch.nextOpen ? ` It opens at ${branch.nextOpen.time}${branch.nextOpen.daysAhead ? ' (another day)' : ''}.` : '';
    throw new HttpError(409, `Our ${zone.branch.nameEn} branch, which delivers to ${zone.nameEn}, is closed right now.${opens}`);
  }
  return present(zone);
};
