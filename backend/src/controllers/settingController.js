import { isOnlinePaymentEnabled } from '../services/payment/index.js';
import * as service from '../services/settingService.js';
import { settingsSchema } from '../validators.js';

// Worked out from the server's payment set-up on every read, never stored: the checkout hides "Order via WhatsApp"
// while the restaurant takes payment online, since that button would hand the order over unpaid.
const DERIVED = ['onlinePayment'];

export const get = async (req, res) => res.json({ ...(await service.getAll()), onlinePayment: String(isOnlinePaymentEnabled()) });

export const update = async (req, res) => {
  const values = settingsSchema.parse(req.body);
  for (const key of DERIVED) delete values[key];
  res.json({ ...(await service.updateMany(values)), onlinePayment: String(isOnlinePaymentEnabled()) });
};
