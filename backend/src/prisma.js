import { PrismaClient } from '@prisma/client';
import { currentTenantId } from './tenantContext.js';

const base = new PrismaClient();

// Models whose rows belong to exactly one tenant and can be filtered
// automatically. Setting and User are excluded because they need composite-key
// and cross-tenant handling respectively — their services scope explicitly.
const SCOPED = new Set(['Category', 'MenuItem', 'Order', 'Banner', 'Media', 'Promotion', 'PickupLocation']);

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

// Connection-level failures, as opposed to anything wrong with the query
// itself. This is what a database restart looks like from the client side: the
// pooled socket is gone, the first query to touch it dies, and Prisma dials a
// fresh connection for the next one.
const CONNECTION_LOST = new Set([
  'P1001', // can't reach the database server
  'P1002', // the server was reached but timed out
  'P1017', // server has closed the connection
  'P2024', // timed out fetching a connection from the pool
]);

// Retried operations are reads only. A write that fails this way may still have
// been committed before the connection dropped, and quietly repeating it could
// charge a customer twice for one order. Those keep failing loudly.
const READ_ONLY = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Rides out a database restart instead of failing the request.
 *
 * Losing the database for a second should cost a visitor a slower page, not an
 * error screen — so a read that dies on a dropped connection is given a couple
 * more chances while Prisma reconnects. Anything else is rethrown untouched.
 *
 * The window is sized against how long the local dev database actually takes
 * to come back after a restart, not a guess: a real login hit the shorter
 * window this replaced and still surfaced a raw connection error to the
 * client, so it wasn't wide enough. ~4.5s covers a restart with real margin
 * while still failing within a few seconds if the database is genuinely down
 * rather than mid-restart.
 */
export const withRetry = async (operation, run) => {
  if (!READ_ONLY.has(operation)) return run();

  let lastError;
  for (const waitMs of [0, 150, 400, 800, 1500, 1800]) {
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    try {
      return await run();
    } catch (error) {
      if (!CONNECTION_LOST.has(error?.code)) throw error;
      lastError = error;
    }
  }
  throw lastError;
};

/**
 * Every query for a scoped model is confined to the current tenant.
 *
 * findUnique/update/delete address a row by primary key, where Prisma rejects
 * an extra tenantId in `where`, so reads are verified after the fact and
 * writes rely on the services reading the row first.
 */
const scopeToTenant = async ({ model, operation, args, query }) => {
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
    // The check below reads tenantId off the row, so a `select` that leaves it
    // out would compare against undefined and reject every record — a silent
    // 404 for correctly-scoped data. Request the column when it is missing,
    // then strip it back out so the caller gets exactly the shape it asked for.
    const needsTenantId = Boolean(args.select) && !args.select.tenantId;
    const found = await query(
      needsTenantId ? { ...args, select: { ...args.select, tenantId: true } } : args,
    );
    if (found && found.tenantId !== tenantId) {
      if (operation === 'findUniqueOrThrow') throw new Error(`${model} not found`);
      return null;
    }
    if (found && needsTenantId) delete found.tenantId;
    return found;
  }

  return query(args);
};

export const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations(params) {
        return withRetry(params.operation, () => scopeToTenant(params));
      },
    },
  },
});
