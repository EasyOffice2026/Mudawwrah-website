import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import * as foodics from '../services/foodicsService.js';
import * as orderService from '../services/orderService.js';
import { runWithTenant } from '../tenantContext.js';
import { foodicsSettingsSchema } from '../validators.js';

export const getSettings = async (req, res) => res.json(await foodics.getSettings());

export const updateSettings = async (req, res) =>
  res.json(await foodics.updateSettings(foodicsSettingsSchema.parse(req.body)));

export const branches = async (req, res) => res.json(await foodics.listBranches());

/** Staff retry for an order whose push failed (or that pre-dates the mapping). */
export const pushOrder = async (req, res) => {
  await orderService.getById(req.params.id);
  const order = await foodics.pushOrder(req.params.id);
  if (!order) throw new HttpError(409, 'Foodics is not configured for this restaurant');
  if (!order.foodicsOrderId) throw new HttpError(502, order.foodicsError || 'Foodics push failed');
  res.json(await orderService.getById(req.params.id));
};

/**
 * `POST /api/foodics/webhook/:slug` — Foodics calls back with no tenant
 * header, so the restaurant is in the path and the shared secret proves the
 * caller. Always 200 once authenticated so Foodics does not keep retrying
 * events we deliberately ignore.
 */
export const webhook = async (req, res) => {
  const tenant = await prisma.tenant.findFirst({ where: { slug: req.params.slug, isActive: true } });
  if (!tenant) throw new HttpError(404, 'Restaurant not found');
  const ok = foodics.verifyWebhook(tenant, {
    rawBody: req.rawBody,
    secretHeader: req.get('x-foodics-secret') || req.get('x-webhook-secret') || req.query.secret,
    signatureHeader: req.get('x-foodics-signature') || req.get('x-signature'),
  });
  if (!ok) throw new HttpError(401, 'Invalid webhook signature');
  const result = await runWithTenant(tenant, () => foodics.applyWebhook(req.body));
  res.json(result);
};
