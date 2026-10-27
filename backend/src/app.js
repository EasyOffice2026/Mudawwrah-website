import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, isOriginAllowed } from './config.js';
import { errorHandler, notFound } from './middleware/error.js';
import { publicCache } from './middleware/publicCache.js';
import { requestLog } from './middleware/requestLog.js';
import { resolveTenant } from './middleware/tenant.js';
import { serveVariant } from './services/imageVariants.js';
import routes from './routes/index.js';

export const createApp = () => {
  const app = express();
  // Nothing tells a visitor which framework answers.
  app.disable('x-powered-by');
  app.use(
    cors({
      // A function rather than a list, so wildcard entries like
      // "https://*.vercel.app" cover per-preview deployment subdomains.
      origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
      // ngrok-skip-browser-warning is what stops ngrok's free tier serving its
      // HTML interstitial to a browser instead of the JSON the app expects.
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant', 'X-Storefront-Host', 'X-Print-Key', 'X-Device-Key', 'ngrok-skip-browser-warning'],
    }),
  );
  app.use(
    express.json({
      limit: '1mb',
      // Retained so the WhatsApp webhook can validate Meta's HMAC signature.
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));
  app.use(requestLog());
  // Made-to-size copies first (/uploads/w400/x.webp), then the files as uploaded. File names are
  // unique per upload, so browsers and the CDN may keep them for good.
  app.get('/uploads/:size/:name', serveVariant);
  app.use(
    '/uploads',
    express.static(config.uploadDir, {
      maxAge: '365d',
      immutable: true,
      // An uploaded file is only ever shown as a picture: never sniffed as another type, never run.
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      },
    }),
  );
  // resolveTenant must stay in front of the routes: it resolves the restaurant
  // and opens the AsyncLocalStorage scope every tenant-aware query relies on.
  // Without it no request carries a tenant and the whole API 400s.
  app.use('/api', publicCache.invalidateOnWrite, resolveTenant, routes);

  // Optionally serve the built frontend from the API, for single-origin
  // deployments where one service answers both.
  const serveStatic = config.staticDir && fs.existsSync(path.join(config.staticDir, 'index.html'));
  if (serveStatic) {
    app.use(express.static(config.staticDir));
  }

  // An unknown /api path is a 404 from the API, not the SPA shell.
  app.use('/api', notFound);
  if (serveStatic) {
    app.get(/.*/, (req, res) => res.sendFile(path.join(config.staticDir, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
};
