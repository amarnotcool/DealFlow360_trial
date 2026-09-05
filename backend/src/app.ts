// Express application wiring. No route handlers live here.

import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { healthRoutes } from './modules/health/health.routes';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json());

  app.use(healthRoutes);

  return app;
}
