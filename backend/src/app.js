import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/error.js';
import { resolveTenant } from './middleware/tenant.js';
import routes from './routes/index.js';

export const createApp = () => {
  const app = express();
  app.use(
    cors({
      origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));
  app.use('/uploads', express.static(config.uploadDir));
  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};
