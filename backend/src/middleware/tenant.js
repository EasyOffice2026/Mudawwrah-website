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
 */
export const resolveTenant = async (req, res, next) => {
  try {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
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

/** Guards routes that are meaningless without a restaurant in context. */
export const requireTenant = (req, res, next) => {
  if (!req.tenant) {
    return next(new HttpError(400, 'No restaurant selected. Pass an X-Tenant header or ?tenant= slug.'));
  }
  next();
};
