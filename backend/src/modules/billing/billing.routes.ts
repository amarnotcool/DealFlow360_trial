import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './billing.controller';
import { idParamSchema, listQuerySchema, paymentSchema } from './billing.schemas';

export const billingRoutes = Router();

// Invoices and payments sit with Finance, the same as the subscriptions module.
const runsBilling = [auth, requireRole('FINANCE', 'ADMIN')];
billingRoutes.use('/invoices', ...runsBilling);
billingRoutes.use('/orders', ...runsBilling);

billingRoutes.get('/invoices', validate('query', listQuerySchema), asyncHandler(controller.list));

billingRoutes.get(
  '/invoices/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

billingRoutes.post(
  '/invoices/:id/pay',
  validate('params', idParamSchema),
  validate('body', paymentSchema),
  asyncHandler(controller.pay),
);

// One order's billing, both streams — the shape screen 13 renders.
billingRoutes.get(
  '/orders/:id/billing',
  validate('params', idParamSchema),
  asyncHandler(controller.orderBilling),
);
