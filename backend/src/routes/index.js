import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import * as banners from '../controllers/bannerController.js';
import * as categories from '../controllers/categoryController.js';
import * as dashboard from '../controllers/dashboardController.js';
import * as feedback from '../controllers/feedbackController.js';
import * as items from '../controllers/itemController.js';
import * as media from '../controllers/mediaController.js';
import * as orders from '../controllers/orderController.js';
import * as payments from '../controllers/paymentController.js';
import * as pickupLocations from '../controllers/pickupLocationController.js';
import * as promotions from '../controllers/promotionController.js';
import * as settings from '../controllers/settingController.js';
import * as tenants from '../controllers/tenantController.js';
import * as users from '../controllers/userController.js';
import * as whatsapp from '../controllers/whatsappController.js';
import {
  authenticate,
  optionalAuth,
  requireAdmin,
  requireCustomer,
  requirePlatformAdmin,
  requireStaff,
} from '../middleware/auth.js';
import { asyncHandler as h } from '../middleware/error.js';
import { reattachTenant, requireTenant } from '../middleware/tenant.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));

// Platform level — no restaurant in context.
router.get('/tenants', h(tenants.listPublic));
router.get('/tenants/current', h(tenants.current));
router.get('/tenants/all', authenticate, requirePlatformAdmin, h(tenants.listAll));
router.post('/tenants', authenticate, requirePlatformAdmin, h(tenants.create));
router.put('/tenants/:id', authenticate, requirePlatformAdmin, h(tenants.update));
router.get('/tenants/:slug', h(tenants.getBySlug));

// Auth is resolved by email across the whole platform, so it needs no tenant.
router.post('/auth/login', h(auth.login));
router.post('/auth/refresh', h(auth.refresh));
router.get('/auth/me', authenticate, h(auth.me));

// ---------------------------------------------------------------------------
// Everything below belongs to exactly one restaurant.
// ---------------------------------------------------------------------------
const scoped = Router();
scoped.use(requireTenant);

// Categories
scoped.get('/categories', h(categories.listPublic));
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
scoped.post('/orders', optionalAuth, h(orders.create));
// Above /orders/:id and public: the uuid in the link is the credential.
// Customer accounts. Signup is tenant-scoped: an account belongs to the
// restaurant it was created on.
scoped.post('/auth/register', h(auth.register));
scoped.get('/orders/mine', requireCustomer, h(orders.mine));
scoped.get('/orders/track/:id', h(orders.track));
scoped.get('/orders', requireStaff, h(orders.list));
scoped.get('/orders/:id', requireStaff, h(orders.getById));
scoped.patch('/orders/:id/status', requireStaff, h(orders.updateStatus));

// Banners
// Pickup branches. The public list is what the checkout offers; everything
// else is staff-only, and every read is confined to the current restaurant.
scoped.get('/pickup-locations', h(pickupLocations.listPublic));
scoped.get('/pickup-locations/all', requireStaff, h(pickupLocations.listAll));
scoped.post('/pickup-locations/reorder', requireStaff, h(pickupLocations.reorder));
scoped.get('/pickup-locations/:id', requireStaff, h(pickupLocations.getById));
scoped.post('/pickup-locations', requireStaff, h(pickupLocations.create));
scoped.put('/pickup-locations/:id', requireStaff, h(pickupLocations.update));
scoped.delete('/pickup-locations/:id', requireAdmin, h(pickupLocations.remove));

scoped.get('/banners', h(banners.listPublic));
scoped.get('/banners/all', requireStaff, h(banners.listAll));
scoped.get('/banners/:id', requireStaff, h(banners.getById));
scoped.post('/banners', requireStaff, h(banners.create));
scoped.put('/banners/:id', requireStaff, h(banners.update));
scoped.delete('/banners/:id', requireStaff, h(banners.remove));

// Promotions
scoped.get('/promotions', h(promotions.listPublic));
scoped.post('/promotions/preview', h(promotions.preview));
scoped.get('/promotions/all', requireStaff, h(promotions.listAll));
scoped.post('/promotions', requireStaff, h(promotions.create));
scoped.put('/promotions/:id', requireStaff, h(promotions.update));
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
scoped.get('/settings', h(settings.get));
scoped.put('/settings', requireStaff, h(settings.update));

// Feedback (WhatsApp after-sale ratings)
router.get('/feedback', requireStaff, h(feedback.list));

// WhatsApp Cloud API webhook
router.get('/whatsapp/webhook', whatsapp.verify);
router.post('/whatsapp/webhook', h(whatsapp.receive));

// Payment gateway callbacks
router.get('/payments/mock/pay', h(payments.mockPay));
router.get('/payments/:provider/callback', h(payments.callback));
router.post('/payments/:provider/callback', h(payments.callback));

// Dashboard
scoped.get('/dashboard/stats', requireStaff, h(dashboard.stats));

router.use(scoped);

export default router;
