import crypto from 'crypto';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenantId } from '../tenantContext.js';

/**
 * Branch devices: the branch lock that holds on a 5G line.
 *
 * The old lock compared the branch's internet address, which a mobile line changes by itself, and branches were
 * locked out. Now the owner approves the device itself, once, at the branch: the browser is given a random key,
 * which it sends with every request, and only the key's hash is stored. Once a branch has an approved device, its
 * branch accounts work on approved devices only, whatever the address. Revoking a device ends that at once.
 */
export const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

const shown = { id: true, branchId: true, name: true, createdAt: true, lastSeenAt: true, revokedAt: true };

/** The restaurant's devices, newest first, with the branch each is approved for. */
export const list = () =>
  prisma.trustedDevice.findMany({
    where: { tenantId: currentTenantId() },
    select: { ...shown, branch: { select: { id: true, nameEn: true, nameAr: true } } },
    orderBy: { createdAt: 'desc' },
  });

/** Approves the device this request comes from for a branch; its key is returned this once and never again. */
export const approve = async (branchId, name) => {
  const tenantId = currentTenantId();
  const branch = await prisma.pickupLocation.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
  if (!branch) throw new HttpError(404, 'Branch not found');
  const key = crypto.randomBytes(32).toString('base64url');
  const device = await prisma.trustedDevice.create({
    data: { tenantId, branchId, name: String(name || 'Branch device').trim().slice(0, 60) || 'Branch device', keyHash: hashKey(key) },
    select: shown,
  });
  return { device, key };
};

export const revoke = async (id) => {
  const device = await prisma.trustedDevice.findFirst({ where: { id, tenantId: currentTenantId() } });
  if (!device) throw new HttpError(404, 'Device not found');
  return prisma.trustedDevice.update({ where: { id }, data: { revokedAt: device.revokedAt || new Date() }, select: shown });
};

/**
 * For the branch lock: whether the branch has approved devices at all, and whether this key is one of them.
 * A device's "last seen" is updated at most every few minutes.
 */
export const checkDevice = async (branchId, key) => {
  const approved = await prisma.trustedDevice.count({ where: { branchId, revokedAt: null } });
  if (!approved) return { required: false };
  if (!key) return { required: true, ok: false };
  const device = await prisma.trustedDevice.findFirst({ where: { branchId, keyHash: hashKey(key), revokedAt: null } });
  if (device && (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 5 * 60_000)) {
    await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return { required: true, ok: Boolean(device) };
};
