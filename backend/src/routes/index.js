import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import * as banners from '../controllers/bannerController.js';
import * as categories from '../controllers/categoryController.js';
import * as dashboard from '../controllers/dashboardController.js';
import * as items from '../controllers/itemController.js';
import * as media from '../controllers/mediaController.js';
import * as orders from '../controllers/orderController.js';
import * as settings from '../controllers/settingController.js';
import * as tenants from '../controllers/tenantController.js';
import * as users from '../controllers/userController.js';
import { authenticate, requireAdmin, requirePlatformAdmin, requireStaff } from '../middleware/auth.js';
import { asyncHandler as h } from '../middleware/error.js';
import { requireTenant } from '../middleware/tenant.js';
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
scoped.get('/items/:id', h(items.getById));
scoped.post('/items', requireStaff, h(items.create));
scoped.put('/items/:id', requireStaff, h(items.update));
scoped.delete('/items/:id', requireAdmin, h(items.remove));

// Orders
scoped.post('/orders', h(orders.create));
scoped.get('/orders', requireStaff, h(orders.list));
scoped.get('/orders/:id', requireStaff, h(orders.getById));
scoped.patch('/orders/:id/status', requireStaff, h(orders.updateStatus));

// Banners
scoped.get('/banners', h(banners.listPublic));
scoped.get('/banners/all', requireStaff, h(banners.listAll));
scoped.get('/banners/:id', requireStaff, h(banners.getById));
scoped.post('/banners', requireStaff, h(banners.create));
scoped.put('/banners/:id', requireStaff, h(banners.update));
scoped.delete('/banners/:id', requireStaff, h(banners.remove));

// Media
scoped.get('/media', requireStaff, h(media.list));
scoped.post('/media', requireStaff, upload.single('file'), h(media.upload));
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

// Dashboard
scoped.get('/dashboard/stats', requireStaff, h(dashboard.stats));

router.use(scoped);

export default router;
