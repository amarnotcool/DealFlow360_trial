// Express application wiring. No route handlers live here.

import cors from 'cors';
import express from 'express';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { approvalsRoutes } from './modules/approvals/approvals.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { billingRoutes } from './modules/billing/billing.routes';
import { customersRoutes } from './modules/customers/customers.routes';
import { dealHealthRoutes } from './modules/deal-health/deal-health.routes';
import { fulfillmentRoutes } from './modules/fulfillment/fulfillment.routes';
import { healthRoutes } from './modules/health/health.routes';
import { inventoryRoutes } from './modules/inventory/inventory.routes';
import { portalRoutes } from './modules/portal/portal.routes';
import { portalAuthRoutes } from './modules/portal-auth/portal-auth.routes';
import { productsRoutes } from './modules/products/products.routes';
import { quotationsRoutes } from './modules/quotations/quotations.routes';
import { rbacRoutes } from './modules/rbac/rbac.routes';
import { reportingRoutes } from './modules/reporting/reporting.routes';
import { subscriptionsRoutes } from './modules/subscriptions/subscriptions.routes';
import { warehousesRoutes } from './modules/warehouses/warehouses.routes';

export function createApp() {
  const app = express();

  // Content-Disposition is not a CORS-safelisted response header, so without
  // exposing it the browser cannot read the filename the report export chose
  // and would save every PDF under a generic fallback name.
  app.use(cors({ origin: env.corsOrigins, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json());

  app.use(healthRoutes);
  // Everything below authRoutes needs a session; each module applies `auth`
  // itself so a route can never be mounted without one by accident.
  app.use(authRoutes);
  app.use(productsRoutes);
  app.use(customersRoutes);
  app.use(rbacRoutes);
  app.use(warehousesRoutes);
  app.use(inventoryRoutes);
  app.use(quotationsRoutes);
  app.use(approvalsRoutes);
  app.use(fulfillmentRoutes);
  app.use(dealHealthRoutes);
  app.use(subscriptionsRoutes);
  app.use(billingRoutes);
  app.use(reportingRoutes);

  // The customer portal is a separate surface with its own session (rule 4).
  app.use(portalAuthRoutes);
  app.use(portalRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
