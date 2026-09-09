import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || '30d',
  uploadDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'),
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`,
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024),
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  whatsapp: {
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    sessionTtlMinutes: Number(process.env.WHATSAPP_SESSION_TTL_MINUTES || 60),
  },
  payment: {
    provider: (process.env.PAYMENT_PROVIDER || 'manual').toLowerCase(),
    myfatoorah: {
      apiKey: process.env.MYFATOORAH_API_KEY || '',
      baseUrl: process.env.MYFATOORAH_BASE_URL || 'https://apitest.myfatoorah.com',
      currency: process.env.MYFATOORAH_CURRENCY || 'KWD',
      webhookSecret: process.env.MYFATOORAH_WEBHOOK_SECRET || '',
    },
    manualPayUrl: process.env.MANUAL_PAY_URL || '',
  },
};

export const isWhatsappConfigured = () =>
  Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId && config.whatsapp.verifyToken);
