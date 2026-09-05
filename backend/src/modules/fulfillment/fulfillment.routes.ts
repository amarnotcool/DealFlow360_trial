import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { validate } from '../../middleware/validate';
import * as controller from './fulfillment.controller';
import {
  acceptSchema,
  idParamSchema,
  listQuerySchema,
  overrideSchema,
  suggestSchema,
} from './fulfillment.schemas';

export const fulfillmentRoutes = Router();

// `:id` is a sales_order id — fulfillment anchors on the order, not the quote.
fulfillmentRoutes.get('/fulfillment', validate('query', listQuerySchema), asyncHandler(controller.list));

fulfillmentRoutes.get(
  '/fulfillment/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

fulfillmentRoutes.post(
  '/fulfillment/:id/suggest-split',
  validate('params', idParamSchema),
  validate('body', suggestSchema),
  asyncHandler(controller.suggest),
);

fulfillmentRoutes.post(
  '/fulfillment/:id/accept-split',
  validate('params', idParamSchema),
  validate('body', acceptSchema),
  asyncHandler(controller.accept),
);

fulfillmentRoutes.post(
  '/fulfillment/:id/override-split',
  validate('params', idParamSchema),
  validate('body', overrideSchema),
  asyncHandler(controller.override),
);

// Shipping is what lets billing happen (specs.md §4 reconciliation rule).
fulfillmentRoutes.post(
  '/fulfillment/:id/ship',
  validate('params', idParamSchema),
  validate('body', suggestSchema),
  asyncHandler(controller.ship),
);
