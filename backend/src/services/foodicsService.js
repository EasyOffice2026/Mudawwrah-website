import crypto from 'crypto';
import { HttpError } from '../middleware/error.js';
import { prisma } from '../prisma.js';
import { currentTenant, currentTenantId, runWithTenant } from '../tenantContext.js';
import { notifyStatusChange } from './whatsapp/notifications.js';

const API_URL = (process.env.FOODICS_API_URL || 'https://api.foodics.com/v5').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.FOODICS_TIMEOUT_MS || 15000);

// Foodics order `type` enum (Foodics API v5 orders reference).
const ORDER_TYPE = { DINE_IN: 1, PICKUP: 2, DELIVERY: 3 };
// Foodics `source` enum for orders created through an integration.
const SOURCE_API = 8;

/**
 * Foodics order `status` values → our OrderStatus. Anything not listed (draft,
 * joined, returned) leaves our order alone.
 */
export const STATUS_MAP = {
  1: 'PENDING', // pending
  2: 'PREPARING', // active — accepted by the POS/KDS
  3: 'CANCELLED', // declined
  4: 'DELIVERED', // closed
  7: 'CANCELLED', // void
};

const NAMED_STATUS_MAP = {
  pending: 'PENDING',
  active: 'PREPARING',
  preparing: 'PREPARING',
  ready: 'READY',
  declined: 'CANCELLED',
  closed: 'DELIVERED',
  void: 'CANCELLED',
  cancelled: 'CANCELLED',
};

export const mapStatus = (foodicsStatus) => {
  if (foodicsStatus == null) return null;
  if (typeof foodicsStatus === 'number' || /^\d+$/.test(String(foodicsStatus))) return STATUS_MAP[Number(foodicsStatus)] || null;
  return NAMED_STATUS_MAP[String(foodicsStatus).toLowerCase()] || null;
};

const credentials = (tenant = currentTenant()) => ({
  token: tenant?.foodicsAccessToken || '',
  branchId: tenant?.foodicsBranchId || '',
});

export const isConfigured = (tenant) => {
  const { token, branchId } = credentials(tenant);
  return Boolean(token && branchId);
};

/** The full tenant row, since the request context only carries public fields. */
const loadTenant = async () => {
  const id = currentTenantId();
  if (!id) throw new HttpError(400, 'No restaurant selected');
  return prisma.tenant.findUnique({ where: { id } });
};

const request = async (token, method, path, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`Foodics request failed: ${error.name === 'AbortError' ? 'timed out' : error.message}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail = json?.message || json?.error || text.slice(0, 200) || response.statusText;
    throw new Error(`Foodics ${response.status}: ${detail}`);
  }
  return json;
};

/* ------------------------------------------------------------------ settings */

const mask = (value) => (value ? `••••${String(value).slice(-4)}` : '');

export const getSettings = async () => {
  const tenant = await loadTenant();
  return {
    configured: isConfigured(tenant),
    branchId: tenant.foodicsBranchId || '',
    accessToken: mask(tenant.foodicsAccessToken),
    webhookSecret: mask(tenant.foodicsWebhookSecret),
    webhookPath: `/api/foodics/webhook/${tenant.slug}`,
  };
};

/**
 * Empty strings mean "leave unchanged" for the two secrets, so the dashboard
 * can re-save the branch without knowing the token; `null` clears them.
 */
export const updateSettings = async ({ accessToken, branchId, webhookSecret }) => {
  const tenantId = currentTenantId();
  if (!tenantId) throw new HttpError(400, 'No restaurant selected');
  const data = {};
  if (branchId !== undefined) data.foodicsBranchId = branchId || null;
  if (accessToken === null) data.foodicsAccessToken = null;
  else if (accessToken) data.foodicsAccessToken = accessToken;
  if (webhookSecret === null) data.foodicsWebhookSecret = null;
  else if (webhookSecret) data.foodicsWebhookSecret = webhookSecret;
  await prisma.tenant.update({ where: { id: tenantId }, data });
  return getSettings();
};

/** Lists branches with the saved token so the owner can pick the right id. */
export const listBranches = async () => {
  const tenant = await loadTenant();
  if (!tenant.foodicsAccessToken) throw new HttpError(400, 'Save a Foodics access token first');
  const json = await request(tenant.foodicsAccessToken, 'GET', '/branches?per_page=100');
  return (json?.data || []).map((b) => ({ id: b.id, name: b.name, nameLocalized: b.name_localized || null, reference: b.reference || null }));
};

/* --------------------------------------------------------------- order push */

/**
 * Builds the Foodics order body from an already-validated Mdawra order. Every
 * line needs a mapped product; selected options are only sent when mapped,
 * unmapped ones are appended to the kitchen notes instead so nothing is lost.
 */
export const buildOrderPayload = (order, { branchId, products, options }) => {
  const missing = [];
  const notes = [];
  const lines = order.items.map((line) => {
    const productId = products.get(line.menuItemId);
    if (!productId) missing.push(line.nameEn);
    const chosen = Array.isArray(line.customizations) ? line.customizations : [];
    const mapped = [];
    const unmapped = [];
    for (const c of chosen) {
      const optionId = options.get(c.id);
      if (optionId) mapped.push({ modifier_option_id: optionId, quantity: 1 });
      else unmapped.push(c.nameEn);
    }
    if (unmapped.length) notes.push(`${line.nameEn}: ${unmapped.join(', ')}`);
    return {
      product_id: productId,
      quantity: line.quantity,
      unit_price: Number(line.unitPrice),
      ...(mapped.length ? { options: mapped } : {}),
    };
  });
  if (missing.length) throw new Error(`No Foodics product mapped for: ${missing.join(', ')}`);

  const isDelivery = order.orderType === 'DELIVERY';
  const address = [order.area, order.block && `Block ${order.block}`, order.street, order.building, order.address]
    .filter(Boolean)
    .join(', ');
  const kitchenNotes = [order.notes, order.deliveryNote, order.cutlery ? 'Cutlery requested' : null, ...notes]
    .filter(Boolean)
    .join(' | ');

  return {
    branch_id: branchId,
    type: isDelivery ? ORDER_TYPE.DELIVERY : ORDER_TYPE.PICKUP,
    source: SOURCE_API,
    reference: order.orderNumber,
    customer: { name: order.customerName, phone: order.customerPhone },
    ...(isDelivery
      ? {
          delivery_address: {
            name: order.customerName,
            description: address,
            ...(order.deliveryLat != null && order.deliveryLng != null
              ? { latitude: Number(order.deliveryLat), longitude: Number(order.deliveryLng) }
              : {}),
          },
        }
      : {}),
    products: lines,
    ...(Number(order.discount) > 0 ? { discount_amount: Number(order.discount) } : {}),
    ...(Number(order.deliveryFee) > 0 ? { delivery_charge: Number(order.deliveryFee) } : {}),
    ...(kitchenNotes ? { kitchen_notes: kitchenNotes } : {}),
    meta: {
      mdawra_order_id: order.id,
      mdawra_order_number: order.orderNumber,
      channel: order.channel,
      payment_method: order.paymentMethod,
      payment_status: order.paymentStatus,
      total: Number(order.total),
    },
  };
};

const mappings = async (order) => {
  const itemIds = [...new Set(order.items.map((l) => l.menuItemId).filter(Boolean))];
  const optionIds = [
    ...new Set(order.items.flatMap((l) => (Array.isArray(l.customizations) ? l.customizations.map((c) => c.id) : []))),
  ];
  const [items, options] = await Promise.all([
    prisma.menuItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, foodicsProductId: true } }),
    optionIds.length
      ? prisma.customizationOption.findMany({ where: { id: { in: optionIds } }, select: { id: true, foodicsModifierOptionId: true } })
      : [],
  ]);
  return {
    products: new Map(items.filter((i) => i.foodicsProductId).map((i) => [i.id, i.foodicsProductId])),
    options: new Map(options.filter((o) => o.foodicsModifierOptionId).map((o) => [o.id, o.foodicsModifierOptionId])),
  };
};

/**
 * Online payments are only pushed once paid, so an abandoned checkout never
 * reaches the kitchen. Cash / card-on-delivery goes straight away.
 */
export const shouldPushNow = (order) => order.paymentStatus === 'PAID' || !['KNET', 'CARD', 'APPLE_PAY'].includes(order.paymentMethod);

/**
 * Creates the order in Foodics and records the result on our order. Never
 * throws — a POS outage must not break the customer's checkout — but returns
 * the updated order so callers (and the retry endpoint) can surface errors.
 */
export const pushOrder = async (orderId) => {
  // Keyed by id, so this also works from payment callbacks that arrive
  // without a tenant in context; the tenant is taken from the order itself.
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: order.tenantId } });
  if (!isConfigured(tenant)) return null;
  if (order.foodicsOrderId) return order;
  return runWithTenant(tenant, async () => {
    try {
      const payload = buildOrderPayload(order, { branchId: tenant.foodicsBranchId, ...(await mappings(order)) });
      const json = await request(tenant.foodicsAccessToken, 'POST', '/orders', payload);
      const foodicsOrderId = json?.data?.id || json?.id;
      if (!foodicsOrderId) throw new Error('Foodics did not return an order id');
      return await prisma.order.update({
        where: { id: orderId },
        data: { foodicsOrderId: String(foodicsOrderId), foodicsError: null },
      });
    } catch (error) {
      console.error(`[foodics] push failed for order ${order.orderNumber}`, error);
      return prisma.order.update({ where: { id: orderId }, data: { foodicsError: String(error.message).slice(0, 500) } });
    }
  });
};

/** Fire-and-forget hook used after order creation and after payment. */
export const pushIfDue = (order) => {
  if (!order || !shouldPushNow(order)) return;
  pushOrder(order.id).catch((error) => console.error('[foodics] push crashed', error));
};

/* ----------------------------------------------------------------- webhook */

const timingSafeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

/**
 * Accepts either the shared secret verbatim (Foodics lets you set custom
 * headers per webhook) or an HMAC-SHA256 of the raw body keyed with it.
 */
export const verifyWebhook = (tenant, { rawBody, secretHeader, signatureHeader }) => {
  const secret = tenant?.foodicsWebhookSecret;
  if (!secret) return false;
  if (secretHeader && timingSafeEqual(secretHeader, secret)) return true;
  if (signatureHeader && rawBody) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const given = String(signatureHeader).replace(/^sha256=/, '');
    return timingSafeEqual(given, expected);
  }
  return false;
};

/**
 * Applies a Foodics order event to our order. Matches by the Foodics order id
 * we stored on push, falling back to our order number in `reference` for
 * orders keyed in at the POS. Runs inside the tenant context.
 */
export const applyWebhook = async (event) => {
  const data = event?.data || event?.order || event || {};
  const foodicsOrderId = data.id ? String(data.id) : null;
  const reference = data.reference ? String(data.reference) : null;
  const status = mapStatus(data.status);
  if (!status || (!foodicsOrderId && !reference)) return { ignored: true };

  const order = await prisma.order.findFirst({
    where: { OR: [...(foodicsOrderId ? [{ foodicsOrderId }] : []), ...(reference ? [{ orderNumber: reference }] : [])] },
    include: { items: true },
  });
  if (!order) return { ignored: true, reason: 'order not found' };
  if (order.status === status || ['DELIVERED', 'CANCELLED'].includes(order.status)) return { orderNumber: order.orderNumber, status: order.status, unchanged: true };

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status, ...(foodicsOrderId && !order.foodicsOrderId ? { foodicsOrderId } : {}) },
    include: { items: true },
  });
  await notifyStatusChange(updated).catch((error) => console.error('[whatsapp] status notification failed', error));
  return { orderNumber: updated.orderNumber, status: updated.status };
};
