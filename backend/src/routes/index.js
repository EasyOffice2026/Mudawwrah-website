import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { clientIpInfo } from '../services/authService.js';
import * as banners from '../controllers/bannerController.js';
import * as categories from '../controllers/categoryController.js';
import * as dashboard from '../controllers/dashboardController.js';
import * as feedback from '../controllers/feedbackController.js';
import * as foodics from '../controllers/foodicsController.js';
import * as items from '../controllers/itemController.js';
import * as media from '../controllers/mediaController.js';
import * as orders from '../controllers/orderController.js';
import * as payments from '../controllers/paymentController.js';
import * as presence from '../controllers/presenceController.js';
import * as icons from '../controllers/iconController.js';
import * as printing from '../controllers/printController.js';
import * as pickupLocations from '../controllers/pickupLocationController.js';
import * as promotions from '../controllers/promotionController.js';
import * as reports from '../controllers/reportController.js';
import * as settings from '../controllers/settingController.js';
import * as soldOut from '../controllers/soldOutController.js';
import * as tenants from '../controllers/tenantController.js';
import * as users from '../controllers/userController.js';
import * as visits from '../controllers/visitController.js';
import * as whatsapp from '../controllers/whatsappController.js';
import * as zones from '../controllers/zoneController.js';
import {
  authenticate,
  optionalAuth,
  requireAdmin,
  requireCustomer,
  requireOrderDesk,
  requirePlatformAdmin,
  requireStaff,
} from '../middleware/auth.js';
import { asyncHandler as h } from '../middleware/error.js';
import { publicCache } from '../middleware/publicCache.js';
import { loginLimit, orderLimit, promoLimit, refreshLimit } from '../middleware/rateLimit.js';
import { requirePrintKey } from '../middleware/printKey.js';
import { reattachTenant, requireTenant } from '../middleware/tenant.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));

// Which code this server is running (Render sets RENDER_GIT_COMMIT) and since when. The website release script reads
// it, so a release that needs a server change cannot be called live while the server is still on the old code.
const STARTED_AT = new Date().toISOString();
router.get('/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ commit: String(process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '').slice(0, 7) || null, startedAt: STARTED_AT });
});

// "What address does the server see for me?" Open it on a branch computer to read the address its
// account must be locked to. It only ever tells a visitor about their own connection.
router.get('/my-address', (req, res) => {
  const { ip, source } = clientIpInfo(req);
  res.set('Cache-Control', 'no-store');
  res.json({
    address: ip,
    readFrom: source,
    seen: {
      'cf-connecting-ip': req.headers['cf-connecting-ip'] || null,
      'x-real-ip': req.headers['x-real-ip'] || null,
      'x-forwarded-for': req.headers['x-forwarded-for'] || null,
      'true-client-ip': req.headers['true-client-ip'] || null,
      socket: req.socket?.remoteAddress || null,
    },
  });
});

// Platform level — no restaurant in context.
router.get('/tenants', h(tenants.listPublic));
router.get('/tenants/current', publicCache.middleware, h(tenants.current));
router.get('/tenants/all', authenticate, requirePlatformAdmin, h(tenants.listAll));
router.post('/tenants', authenticate, requirePlatformAdmin, h(tenants.create));
router.put('/tenants/:id', authenticate, requirePlatformAdmin, h(tenants.update));
router.get('/tenants/icon', h(icons.icon));
router.get('/tenants/:slug', h(tenants.getBySlug));

// Auth is resolved by email across the whole platform, so it needs no tenant.
router.post('/auth/login', loginLimit, h(auth.login));
router.post('/auth/refresh', refreshLimit, h(auth.refresh));
router.get('/auth/me', authenticate, h(auth.me));

// ---------------------------------------------------------------------------
// Everything below belongs to exactly one restaurant.
// ---------------------------------------------------------------------------
const scoped = Router();
scoped.use(requireTenant);

// Categories
scoped.get('/categories', publicCache.middleware, h(categories.listPublic));
scoped.get('/categories/all', requireStaff, h(categories.listAll));
scoped.post('/categories/reorder', requireStaff, h(categories.reorder));
scoped.get('/categories/:id', h(categories.getById));
scoped.post('/categories', requireStaff, h(categories.create));
scoped.put('/categories/:id', requireStaff, h(categories.update));
scoped.delete('/categories/:id', requireAdmin, h(categories.remove));

// Menu items
scoped.get('/items', h(items.list));
scoped.post('/items/reorder', requireStaff, h(items.reorder));
scoped.post('/items/bulk-availability', requireStaff, h(items.bulkAvailability));
// Before /items/:id, otherwise 'popular' is parsed as an item id.
scoped.get('/items/popular', h(items.popular));
scoped.get('/items/:id', h(items.getById));
scoped.post('/items', requireStaff, h(items.create));
scoped.put('/items/:id', requireStaff, h(items.update));
scoped.delete('/items/:id', requireAdmin, h(items.remove));

// Orders
// Watched by an uptime monitor (see DEPLOY.md): answers 503 when an order has waited too long to be accepted.
scoped.get('/health/orders', h(orders.health));
scoped.post('/orders', orderLimit, optionalAuth, h(orders.create));
// One per storefront browser session, for the visitors-to-orders conversion rate.
scoped.post('/visits', h(visits.record));
// Above /orders/:id and public: the uuid in the link is the credential.
// Customer accounts. Signup is tenant-scoped: an account belongs to the
// restaurant it was created on.
scoped.post('/auth/register', loginLimit, h(auth.register));
scoped.get('/orders/mine', requireCustomer, h(orders.mine));
scoped.get('/orders/track/:id', h(orders.track));
// Order desk: owner, staff and branch accounts. Branch accounts see and update only their branch's orders.
scoped.get('/orders', requireOrderDesk, h(orders.list));
// Before /orders/:id, which would otherwise read "feed" as an order id.
scoped.get('/orders/feed', requireOrderDesk, h(orders.feed));
// The live connection an open order screen keeps, and which branch screens are connected (owner).
scoped.get('/orders/stream', requireOrderDesk, orders.stream);
scoped.get('/branches/presence', requireStaff, h(presence.branches));
// Automatic printing. A branch's print station asks for its waiting tickets with a private key (no
// login to expire on an unattended computer); the owner lists the stations; the order desk can reprint.
scoped.get('/print/jobs', requirePrintKey, h(printing.jobs));
scoped.post('/print/jobs/:id/printed', requirePrintKey, h(printing.printed));
scoped.get('/print/stations', requireStaff, h(printing.stations));
scoped.post('/orders/:id/reprint', requireOrderDesk, h(printing.reprint));
scoped.get('/orders/:id', requireOrderDesk, h(orders.getById));
scoped.patch('/orders/:id/status', requireOrderDesk, h(orders.updateStatus));

// Items sold out at one branch only. Branch accounts manage their own branch.
scoped.get('/branch-sold-out', requireOrderDesk, h(soldOut.list));
scoped.put('/branch-sold-out', requireOrderDesk, h(soldOut.set));

// Delivery zones: the public list feeds checkout and WhatsApp; editing them (fees,
// minimums, which branch serves an area) is the owner's alone.
scoped.get('/zones', publicCache.middleware, h(zones.listPublic));
scoped.get('/zones/all', requireStaff, h(zones.listAll));
scoped.get('/zones/:id', requireStaff, h(zones.getById));
scoped.post('/zones', requireAdmin, h(zones.create));
scoped.put('/zones/:id', requireAdmin, h(zones.update));
scoped.delete('/zones/:id', requireAdmin, h(zones.remove));

// Banners
// Pickup branches. The public list is what the checkout offers; everything
// else is staff-only, and every read is confined to the current restaurant.
scoped.get('/pickup-locations', publicCache.middleware, h(pickupLocations.listPublic));
scoped.get('/pickup-locations/all', requireStaff, h(pickupLocations.listAll));
scoped.post('/pickup-locations/reorder', requireStaff, h(pickupLocations.reorder));
scoped.get('/pickup-locations/:id', requireStaff, h(pickupLocations.getById));
// Owner only: these set opening hours and the static IPs branch accounts are confined to.
scoped.post('/pickup-locations', requireAdmin, h(pickupLocations.create));
scoped.put('/pickup-locations/:id', requireAdmin, h(pickupLocations.update));
scoped.delete('/pickup-locations/:id', requireAdmin, h(pickupLocations.remove));

scoped.get('/banners', h(banners.listPublic));
scoped.get('/banners/all', requireStaff, h(banners.listAll));
scoped.get('/banners/:id', requireStaff, h(banners.getById));
scoped.post('/banners', requireStaff, h(banners.create));
scoped.put('/banners/:id', requireStaff, h(banners.update));
scoped.delete('/banners/:id', requireStaff, h(banners.remove));

// Promotions
scoped.get('/promotions', publicCache.middleware, h(promotions.listPublic));
scoped.post('/promotions/preview', promoLimit, h(promotions.preview));
scoped.get('/promotions/all', requireStaff, h(promotions.listAll));
// Discount codes are the owner's alone (client requirement).
scoped.post('/promotions', requireAdmin, h(promotions.create));
scoped.put('/promotions/:id', requireAdmin, h(promotions.update));
scoped.delete('/promotions/:id', requireAdmin, h(promotions.remove));

// Media
scoped.get('/media', requireStaff, h(media.list));
scoped.post('/media', requireStaff, upload.single('file'), reattachTenant, h(media.upload));
scoped.delete('/media/:id', requireStaff, h(media.remove));

// Users
scoped.get('/users', requireAdmin, h(users.list));
scoped.get('/users/:id', requireAdmin, h(users.getById));
scoped.post('/users', requireAdmin, h(users.create));
scoped.put('/users/:id', requireAdmin, h(users.update));
scoped.delete('/users/:id', requireAdmin, h(users.remove));

// Settings
scoped.get('/settings', publicCache.middleware, h(settings.get));
// Fees, minimum order, tax and payment methods: owner only (client requirement).
scoped.put('/settings', requireAdmin, h(settings.update));

// Feedback (WhatsApp after-sale ratings)
router.get('/feedback', requireStaff, h(feedback.list));

// WhatsApp Cloud API webhook
router.get('/whatsapp/webhook', whatsapp.verify);
router.post('/whatsapp/webhook', h(whatsapp.receive));

// Foodics POS: status updates come back per restaurant, authenticated by the
// webhook secret saved in Settings → Foodics.
router.post('/foodics/webhook/:slug', h(foodics.webhook));
scoped.get('/foodics/settings', requireAdmin, h(foodics.getSettings));
scoped.put('/foodics/settings', requireAdmin, h(foodics.updateSettings));
scoped.get('/foodics/branches', requireAdmin, h(foodics.branches));
scoped.post('/orders/:id/foodics', requireOrderDesk, h(foodics.pushOrder));

// Payment gateway callbacks
router.get('/payments/mock/pay', h(payments.mockPay));
router.get('/payments/:provider/callback', h(payments.callback));
router.post('/payments/:provider/callback', h(payments.callback));

// Dashboard
scoped.get('/dashboard/stats', requireStaff, h(dashboard.stats));
scoped.get('/dashboard/branches', requireStaff, h(dashboard.branches));
scoped.get('/reports', requireStaff, h(reports.report));
// The day's closing sheet: branch managers close their own branch with it, so the order desk may open it.
scoped.get('/reports/closing', requireOrderDesk, h(reports.closing));

// A restaurant's own name, banner and logo — the fields the storefront
// header and the platform picker actually display. requireAdmin, not just
// staff: this is the restaurant's identity, not day-to-day order handling.
scoped.put('/tenant', requireAdmin, h(tenants.updateOwn));

router.use(scoped);

export default router;
