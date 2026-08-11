/**
 * The restaurant is taken from the URL path (/r/burger-house/...).
 *
 * Subdomains are deliberately not read here: the platform itself is served
 * from a *.vercel.app host whose first label would look like a slug. The API
 * already resolves subdomains and custom domains, so moving a restaurant onto
 * pizzaco.example.com later needs no frontend change.
 */
export const currentTenantSlug = (pathname = window.location.pathname) => {
  const match = pathname.match(/^\/r\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
};

export const tenantPath = (slug, suffix = '') => `/r/${slug}${suffix}`;

/** Auth and cart are stored per restaurant so switching never leaks state. */
export const storageKey = (name, slug = currentTenantSlug()) => `mdawra_${name}_${slug || 'platform'}`;
