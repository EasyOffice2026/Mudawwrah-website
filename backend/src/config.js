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

/**
 * Whether a browser origin is allowed to call the API.
 *
 * Entries in CORS_ORIGINS may use a leading wildcard — "https://*.vercel.app"
 * — because Vercel gives every preview deployment its own subdomain, and
 * listing them one by one is not practical.
 */
export const isOriginAllowed = (origin) => {
  if (!origin) return true; // curl, server-to-server, same-origin
  if (config.corsOrigins.includes('*')) return true;
  return config.corsOrigins.some((allowed) => {
    if (!allowed.includes('*')) return allowed === origin;
    const [scheme, host] = allowed.split('://');
    const suffix = host.replace(/^\*/, '');
    return origin.startsWith(`${scheme}://`) && origin.endsWith(suffix);
  });
};

export const isWhatsappConfigured = () =>
  Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId && config.whatsapp.verifyToken);

/**
 * Refuses to start a production deployment on development defaults.
 *
 * The fallback JWT secret is committed to this repository, so anything signed
 * with it can be forged by anyone who has read the source — including a token
 * claiming to be the platform owner, who administers every restaurant. Serving
 * a real origin with wide-open CORS is the same class of mistake. Failing
 * loudly at boot is far kinder than finding out afterwards.
 */
export const assertProductionConfig = () => {
  if (process.env.NODE_ENV !== 'production') return;

  const devSecrets = ['dev-secret-change-me', 'local-dev-secret', 'change-me-in-production'];
  const problems = [];

  if (!process.env.JWT_SECRET || devSecrets.includes(config.jwtSecret)) {
    problems.push('JWT_SECRET is unset or still a development value — set a long random secret.');
  }
  if (config.corsOrigins.includes('*')) {
    problems.push('CORS_ORIGINS is "*" — list the exact site origins instead.');
  }
  if (!process.env.DATABASE_URL) {
    problems.push('DATABASE_URL is unset.');
  }

  if (problems.length) {
    console.error('\nRefusing to start in production with unsafe configuration:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    process.exit(1);
  }
};
