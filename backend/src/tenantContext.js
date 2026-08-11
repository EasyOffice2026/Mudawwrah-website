import { AsyncLocalStorage } from 'async_hooks';

/**
 * Holds the tenant resolved for the current request. Using AsyncLocalStorage
 * means services never have to thread a tenantId through every call, and no
 * query can accidentally forget it.
 */
export const tenantStore = new AsyncLocalStorage();

export const runWithTenant = (tenant, fn) => tenantStore.run({ tenant }, fn);

export const currentTenant = () => tenantStore.getStore()?.tenant ?? null;

export const currentTenantId = () => currentTenant()?.id ?? null;
