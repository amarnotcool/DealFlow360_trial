import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './subscriptions.controller';
import { cancelSchema, changeSchema, idParamSchema, listQuerySchema } from './subscriptions.schemas';

export const subscriptionsRoutes = Router();

// specs.md §2: reconciling recurring billing and credit notes is Finance's work.
const runsBilling = requireRole('FINANCE', 'ADMIN');

subscriptionsRoutes.use(auth, runsBilling);

subscriptionsRoutes.get(
  '/subscriptions',
  validate('query', listQuerySchema),
  asyncHandler(controller.list),
);

// The plans a change can move a subscription to — read only.
subscriptionsRoutes.get('/subscription-plans', asyncHandler(controller.plans));

subscriptionsRoutes.get(
  '/subscriptions/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

subscriptionsRoutes.post(
  '/subscriptions/:id/change',
  validate('params', idParamSchema),
  validate('body', changeSchema),
  asyncHandler(controller.change),
);

subscriptionsRoutes.post(
  '/subscriptions/:id/cancel',
  validate('params', idParamSchema),
  validate('body', cancelSchema),
  asyncHandler(controller.cancel),
);

// The demo trigger for the billing cycle: no cron, one explicit advance.
subscriptionsRoutes.post(
  '/subscriptions/:id/generate-invoice',
  validate('params', idParamSchema),
  asyncHandler(controller.generateInvoice),
);
