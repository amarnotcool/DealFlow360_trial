import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './warehouses.controller';
import {
  createWarehouseSchema,
  idParamSchema,
  listQuerySchema,
  updateWarehouseSchema,
} from './warehouses.schemas';

export const warehousesRoutes = Router();

// Which warehouses exist is readable by everyone signed in — a rep watching an
// order needs it. Adding or editing one is admin work (specs.md §2).
const ownsTheNetwork = requireRole('ADMIN');

// Path-scoped so these never run for another module's routes.
warehousesRoutes.use('/warehouses', auth);

warehousesRoutes.get('/warehouses', validate('query', listQuerySchema), asyncHandler(controller.list));

warehousesRoutes.get(
  '/warehouses/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

warehousesRoutes.post(
  '/warehouses',
  ownsTheNetwork,
  validate('body', createWarehouseSchema),
  asyncHandler(controller.create),
);

warehousesRoutes.patch(
  '/warehouses/:id',
  ownsTheNetwork,
  validate('params', idParamSchema),
  validate('body', updateWarehouseSchema),
  asyncHandler(controller.update),
);

// Deletes a warehouse nothing has used, deactivates one the record depends on.
warehousesRoutes.delete(
  '/warehouses/:id',
  ownsTheNetwork,
  validate('params', idParamSchema),
  asyncHandler(controller.remove),
);
