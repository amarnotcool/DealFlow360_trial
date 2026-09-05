import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { validate } from '../../middleware/validate';
import * as controller from './subscriptions.controller';
import {
  actorSchema,
  cancelSchema,
  changeSchema,
  idParamSchema,
  listQuerySchema,
} from './subscriptions.schemas';

export const subscriptionsRoutes = Router();

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
  validate('body', actorSchema),
  asyncHandler(controller.generateInvoice),
);
