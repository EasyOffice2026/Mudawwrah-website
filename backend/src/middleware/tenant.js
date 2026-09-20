import { prisma } from '../prisma.js';
import { runWithTenant } from '../tenantContext.js';
import { HttpError } from './error.js';

const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'admin', 'app', 'localhost']);

const bySlug = (slug) => prisma.tenant.findFirst({ where: { slug, isActive: true } });

/**
 * Resolves the restaurant this request belongs to, in priority order:
 *
 *   1. custom domain          order.pizzaco.com          (paid tier)
 *   2. subdomain              pizzaco.platform.com
 *   3. X-Tenant header        sent by the SPA from /r/:slug
 *   4. ?tenant= query param   convenient for curl and demos
 *
 * Host-based resolution is listed first so that moving a restaurant onto its
 * own domain later needs no code change.
 *
 * The host itself comes from X-Storefront-Host ahead of the raw HTTP Host
 * header. The frontend calls this API cross-origin — a different host than
 * the address bar the customer is actually looking at — so the connection's
 * own Host header is the API's host, never the storefront's; only the SPA
 * telling us its real address bar makes a restaurant's own domain resolve at
 * all. X-Forwarded-Host stays as a fallback for a same-origin deployment
 * behind a reverse proxy, which sets that header itself.
 */
export const resolveTenant = async (req, res, next) => {
  try {
    const host = String(
      req.headers['x-storefront-host'] || req.headers['x-forwarded-host'] || req.headers.host || '',
    ).split(':')[0];
    let tenant = null;

    if (host) {
      tenant = await prisma.tenant.findFirst({ where: { customDomain: host, isActive: true } });
      if (!tenant) {
        const [sub, ...rest] = host.split('.');
        if (rest.length >= 2 && !RESERVED_SUBDOMAINS.has(sub)) tenant = await bySlug(sub);
      }
    }

    const explicit = req.headers['x-tenant'] || req.query.tenant;
    if (!tenant && explicit) tenant = await bySlug(String(explicit));

    req.tenant = tenant;
    runWithTenant(tenant, () => next());
  } catch (error) {
    next(error);
  }
};

/**
 * Re-enters the tenant's AsyncLocalStorage context after a middleware that
 * may have escaped it.
 *
 * Multer's multipart parser is the known case: verified by instrumenting
 * both sides of it directly, the tenant is present in context immediately
 * before it runs and gone immediately after, for an upload large enough to
 * span more than one stream chunk — a small file completes within a single
 * tick and never shows the gap. `req.tenant` is an ordinary property on the
 * request object rather than something carried through AsyncLocalStorage, so
 * it survives untouched regardless, which is what makes re-entering context
 * from it here reliable rather than a guess.
 *
 * Mount this after any middleware that reads the request as a raw stream
 * (file uploads today; anything similar added later) and before the routes
 * that follow it.
 */
export const reattachTenant = (req, res, next) => runWithTenant(req.tenant, () => next());

/** Guards routes that are meaningless without a restaurant in context. */
export const requireTenant = (req, res, next) => {
  if (!req.tenant) {
    return next(new HttpError(400, 'No restaurant selected. Pass an X-Tenant header or ?tenant= slug.'));
  }
  next();
};
