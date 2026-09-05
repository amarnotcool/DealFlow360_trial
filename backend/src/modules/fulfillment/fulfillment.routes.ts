import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './fulfillment.controller';
import {
  acceptSchema,
  backorderListQuerySchema,
  consolidateSchema,
  idParamSchema,
  listQuerySchema,
  overrideSchema,
} from './fulfillment.schemas';

export const fulfillmentRoutes = Router();

// specs.md §2: Finance / Ops manages warehouse splits and backorders. A rep can
// watch their order move, but only Finance decides where it ships from.
const movesStock = requireRole('FINANCE', 'ADMIN');

fulfillmentRoutes.use('/fulfillment', auth);
fulfillmentRoutes.use('/backorders', auth);

// `:id` is a sales_order id — fulfillment anchors on the order, not the quote.
fulfillmentRoutes.get('/fulfillment', validate('query', listQuerySchema), asyncHandler(controller.list));

fulfillmentRoutes.get(
  '/fulfillment/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

fulfillmentRoutes.post(
  '/fulfillment/:id/suggest-split',
  movesStock,
  validate('params', idParamSchema),
  asyncHandler(controller.suggest),
);

fulfillmentRoutes.post(
  '/fulfillment/:id/accept-split',
  movesStock,
  validate('params', idParamSchema),
  validate('body', acceptSchema),
  asyncHandler(controller.accept),
);

fulfillmentRoutes.post(
  '/fulfillment/:id/override-split',
  movesStock,
  validate('params', idParamSchema),
  validate('body', overrideSchema),
  asyncHandler(controller.override),
);

// Shipping is what lets billing happen (specs.md §4 reconciliation rule).
fulfillmentRoutes.post(
  '/fulfillment/:id/ship',
  movesStock,
  validate('params', idParamSchema),
  asyncHandler(controller.ship),
);

// What is still short across every order — the queue stock receipts feed.
fulfillmentRoutes.get(
  '/backorders',
  validate('query', backorderListQuerySchema),
  asyncHandler(controller.backorders),
);

// specs.md §4: once stock arrives, the remaining backorder is consolidated
// into new shipments. Reserving is all this does; /ship still sends them.
fulfillmentRoutes.post(
  '/fulfillment/:id/consolidate-backorders',
  movesStock,
  validate('params', idParamSchema),
  validate('body', consolidateSchema),
  asyncHandler(controller.consolidate),
);
