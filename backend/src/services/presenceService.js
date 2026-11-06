/**
 * Which branches are connected right now, for the owner, in two parts:
 * - the order screen: a branch account's dashboard checks for orders every few seconds and keeps a live
 *   connection with a heartbeat every 20 seconds;
 * - the printer: the branch's print station (in Chrome or the Sunmi app) asks for tickets every 3 seconds.
 *
 * Each check counts as "seen". A branch stays "connected" for 3 minutes after it was last seen, so a tab
 * switch, a page reload or a short network drop never shows as offline; only a screen or printer that is really
 * gone does (the owner asked for a status that does not flicker, 6 November 2026).
 *
 * Kept in memory for speed, and written to the branch at most once a minute, so a server restart or deploy does
 * not blank every branch to "not seen".
 */
export const ONLINE_MS = 3 * 60_000;
const SAVE_EVERY_MS = 60_000;
const KINDS = ['screen', 'printer'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const seen = new Map();

const save = async (tenantId, branchId, kind, at, address) => {
  const { prisma } = await import('../prisma.js');
  // Plain SQL, so the branch's own "last changed" time (which the menu's caches follow) is left alone.
  if (kind === 'printer') {
    await prisma.$executeRaw`UPDATE "PickupLocation" SET "printerSeenAt" = ${at} WHERE "id" = ${branchId} AND "tenantId" = ${tenantId}`;
  } else {
    await prisma.$executeRaw`UPDATE "PickupLocation" SET "screenSeenAt" = ${at}, "screenAddress" = ${address} WHERE "id" = ${branchId} AND "tenantId" = ${tenantId}`;
  }
};

/** A branch's order screen (kind "screen") or print station (kind "printer") checked in. */
export const touch = (tenantId, branchId, address, now = Date.now(), kind = 'screen') => {
  if (!tenantId || !branchId || !KINDS.includes(kind)) return;
  const key = `${tenantId}|${branchId}|${kind}`;
  const entry = { at: now, address: address || null, savedAt: seen.get(key)?.savedAt ?? 0 };
  if (UUID.test(branchId) && now - entry.savedAt >= SAVE_EVERY_MS) {
    entry.savedAt = now;
    save(tenantId, branchId, kind, new Date(now), entry.address).catch(() => {
      // Only the restart-proof copy is lost; the live status is in memory.
    });
  }
  seen.set(key, entry);
};

const latest = (memory, stored) => {
  const storedAt = stored ? new Date(stored).getTime() : 0;
  return memory && memory.at >= storedAt ? memory.at : storedAt || null;
};

/**
 * Each branch with when its order screen and its printer were last seen, and whether each counts as connected.
 * `branches` may carry the saved screenSeenAt, screenAddress and printerSeenAt, used when memory has nothing newer.
 */
export const statuses = (tenantId, branches, now = Date.now()) =>
  branches.map((branch) => {
    const screen = seen.get(`${tenantId}|${branch.id}|screen`);
    const printer = seen.get(`${tenantId}|${branch.id}|printer`);
    const screenAt = latest(screen, branch.screenSeenAt);
    const printerAt = latest(printer, branch.printerSeenAt);
    return {
      id: branch.id,
      nameEn: branch.nameEn,
      nameAr: branch.nameAr,
      lastSeenAt: screenAt ? new Date(screenAt).toISOString() : null,
      address: screen?.address || branch.screenAddress || null,
      online: Boolean(screenAt && now - screenAt <= ONLINE_MS),
      printer: {
        lastSeenAt: printerAt ? new Date(printerAt).toISOString() : null,
        online: Boolean(printerAt && now - printerAt <= ONLINE_MS),
      },
    };
  });

export const forgetAll = () => seen.clear();
