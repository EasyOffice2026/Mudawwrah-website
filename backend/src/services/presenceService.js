/**
 * Which branch screens are connected right now, for the owner. A branch screen checks for orders every few seconds,
 * so each check (and each heartbeat of its live connection) counts as "seen". Kept in memory: after a server restart
 * every branch reads "not seen yet" until its next check, a few seconds later.
 */
export const ONLINE_MS = 45_000;
const seen = new Map();

export const touch = (tenantId, branchId, address, now = Date.now()) => {
  if (tenantId && branchId) seen.set(`${tenantId}|${branchId}`, { at: now, address: address || null });
};

/** Each branch with when its screen was last seen, from which address, and whether that counts as connected. */
export const statuses = (tenantId, branches, now = Date.now()) =>
  branches.map((branch) => {
    const last = seen.get(`${tenantId}|${branch.id}`);
    return {
      id: branch.id,
      nameEn: branch.nameEn,
      nameAr: branch.nameAr,
      lastSeenAt: last ? new Date(last.at).toISOString() : null,
      address: last?.address || null,
      online: Boolean(last && now - last.at <= ONLINE_MS),
    };
  });

export const forgetAll = () => seen.clear();
