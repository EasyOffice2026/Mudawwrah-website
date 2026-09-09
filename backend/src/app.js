import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/error.js';
import routes from './routes/index.js';

export const createApp = () => {
  const app = express();
  app.use(
    cors({
      origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));
  app.use('/uploads', express.static(config.uploadDir));
  app.use('/api', routes);

  const serveStatic = config.staticDir && fs.existsSync(path.join(config.staticDir, 'index.html'));
  if (serveStatic) {
    app.use(express.static(config.staticDir));
  }

  app.use('/api', notFound);
  if (serveStatic) {
    app.get(/.*/, (req, res) => res.sendFile(path.join(config.staticDir, 'index.html')));
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
};
