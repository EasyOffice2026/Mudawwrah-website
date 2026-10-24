/**
 * Tells open order screens that something changed, so a new order reaches a branch the moment it exists instead of
 * at the next 10-second check. Each open order screen holds one connection (see orderController.stream); a branch
 * screen only hears about its own branch, the owner and staff hear about all of them.
 *
 * It lives in this server's memory. If two servers ever run side by side, a screen hears only about changes made
 * on the server it is connected to, which is why every screen also keeps its regular check as a safety net.
 */
const watchers = new Set();

/** Registers a screen. `branchId` null means it sees every branch. Returns the function that unregisters it. */
export const watch = (tenantId, branchId, send) => {
  const watcher = { tenantId, branchId, send };
  watchers.add(watcher);
  return () => watchers.delete(watcher);
};

/** Something changed at this branch (a new order, a payment confirmed, a status moved). */
export const announce = (tenantId, branchId, type = 'orders') => {
  for (const watcher of watchers) {
    if (watcher.tenantId !== tenantId) continue;
    if (watcher.branchId && watcher.branchId !== branchId) continue;
    try {
      watcher.send(type);
    } catch {
      // A screen that went away is dropped; it will reconnect on its own.
      watchers.delete(watcher);
    }
  }
};

export const watcherCount = () => watchers.size;
