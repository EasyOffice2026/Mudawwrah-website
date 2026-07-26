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
import * as settings from '../controllers/settingController.js';
import * as users from '../controllers/userController.js';
import * as whatsapp from '../controllers/whatsappController.js';
import { authenticate, requireAdmin, requireStaff } from '../middleware/auth.js';
import { asyncHandler as h } from '../middleware/error.js';
import { upload } from '../middleware/upload.js';

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));

// Auth
router.post('/auth/login', h(auth.login));
router.post('/auth/refresh', h(auth.refresh));
router.get('/auth/me', authenticate, h(auth.me));

// Categories (public read of the visible menu, admin CRUD)
router.get('/categories', h(categories.listPublic));
router.get('/categories/all', requireStaff, h(categories.listAll));
router.post('/categories/reorder', requireStaff, h(categories.reorder));
router.get('/categories/:id', h(categories.getById));
router.post('/categories', requireStaff, h(categories.create));
router.put('/categories/:id', requireStaff, h(categories.update));
router.delete('/categories/:id', requireAdmin, h(categories.remove));

// Menu items
router.get('/items', h(items.list));
router.post('/items/reorder', requireStaff, h(items.reorder));
router.post('/items/bulk-availability', requireStaff, h(items.bulkAvailability));
router.get('/items/:id', h(items.getById));
router.post('/items', requireStaff, h(items.create));
router.put('/items/:id', requireStaff, h(items.update));
router.delete('/items/:id', requireAdmin, h(items.remove));

// Orders
router.post('/orders', h(orders.create));
router.get('/orders', requireStaff, h(orders.list));
router.get('/orders/:id', requireStaff, h(orders.getById));
router.patch('/orders/:id/status', requireStaff, h(orders.updateStatus));

// Banners
router.get('/banners', h(banners.listPublic));
router.get('/banners/all', requireStaff, h(banners.listAll));
router.get('/banners/:id', requireStaff, h(banners.getById));
router.post('/banners', requireStaff, h(banners.create));
router.put('/banners/:id', requireStaff, h(banners.update));
router.delete('/banners/:id', requireStaff, h(banners.remove));

// Media
router.get('/media', requireStaff, h(media.list));
router.post('/media', requireStaff, upload.single('file'), h(media.upload));
router.delete('/media/:id', requireStaff, h(media.remove));

// Users
router.get('/users', requireAdmin, h(users.list));
router.get('/users/:id', requireAdmin, h(users.getById));
router.post('/users', requireAdmin, h(users.create));
router.put('/users/:id', requireAdmin, h(users.update));
router.delete('/users/:id', requireAdmin, h(users.remove));

// Settings
router.get('/settings', h(settings.get));
router.put('/settings', requireStaff, h(settings.update));

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
router.get('/dashboard/stats', requireStaff, h(dashboard.stats));

export default router;
