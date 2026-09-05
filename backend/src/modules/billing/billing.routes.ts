import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { validate } from '../../middleware/validate';
import * as controller from './billing.controller';
import { idParamSchema, listQuerySchema, paymentSchema } from './billing.schemas';

export const billingRoutes = Router();

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
