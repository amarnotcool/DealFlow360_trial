// Express application wiring. No route handlers live here.

import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { approvalsRoutes } from './modules/approvals/approvals.routes';
import { fulfillmentRoutes } from './modules/fulfillment/fulfillment.routes';
import { healthRoutes } from './modules/health/health.routes';
import { quotationsRoutes } from './modules/quotations/quotations.routes';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json());

  app.use(healthRoutes);
  app.use(quotationsRoutes);
  app.use(approvalsRoutes);
  app.use(fulfillmentRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
