import { api } from './api';
import { peek, remember } from './storefrontCache';
import { currentTenantSlug } from './tenant';

/** The copy of a public list this phone already has for the restaurant in the address, or null. */
export const cachedPath = (path) => peek(currentTenantSlug(), path);

/** Fetches the latest of a public list and keeps it for next time. */
export const refresh = async (path) => {
  const { data } = await api.get(path);
  const slug = currentTenantSlug();
  if (slug) remember(slug, path, data);
  return data;
};
