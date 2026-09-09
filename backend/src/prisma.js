import { PrismaClient } from '@prisma/client';
import { currentTenantId } from './tenantContext.js';

const base = new PrismaClient();

// Models whose rows belong to exactly one tenant and can be filtered
// automatically. Setting and User are excluded because they need composite-key
// and cross-tenant handling respectively — their services scope explicitly.
const SCOPED = new Set(['Category', 'MenuItem', 'Order', 'Banner', 'Media', 'Promotion']);

// Operations whose `where` is a plain filter, so tenantId can be merged in.
const FILTERED = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/**
 * Every query for a scoped model is confined to the current tenant.
 *
 * findUnique/update/delete address a row by primary key, where Prisma rejects
 * an extra tenantId in `where`, so reads are verified after the fact and
 * writes rely on the services reading the row first.
 */
export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const tenantId = currentTenantId();
        if (!tenantId || !SCOPED.has(model)) return query(args);

        if (FILTERED.has(operation)) {
          return query({ ...args, where: { ...args.where, tenantId } });
        }

        if (operation === 'create') {
          return query({ ...args, data: { tenantId, ...args.data } });
        }

        if (operation === 'createMany') {
          const data = Array.isArray(args.data) ? args.data : [args.data];
          return query({ ...args, data: data.map((row) => ({ tenantId, ...row })) });
        }

        if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
          const found = await query(args);
          if (found && found.tenantId !== tenantId) {
            if (operation === 'findUniqueOrThrow') throw new Error(`${model} not found`);
            return null;
          }
          return found;
        }

        return query(args);
      },
    },
  },
});
