import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './inventory.controller';
import {
  adjustSchema,
  idParamSchema,
  listQuerySchema,
  receiveSchema,
  reorderPointSchema,
} from './inventory.schemas';

export const inventoryRoutes = Router();

// specs.md §2 puts warehouse and stock operations with Finance / Ops; an admin
// keeps the same reach. Everyone signed in can read stock — a rep quoting from
// it needs to know what is on the shelf.
const movesStock = requireRole('FINANCE', 'ADMIN');

// Path-scoped so these never run for another module's routes.
inventoryRoutes.use('/inventory', auth);

inventoryRoutes.get('/inventory', validate('query', listQuerySchema), asyncHandler(controller.list));

// Stock arriving. Opens the row when the warehouse has never held the product.
inventoryRoutes.post(
  '/inventory/receive',
  movesStock,
  validate('body', receiveSchema),
  asyncHandler(controller.receive),
);

// A counted correction, which always carries a reason into the audit log.
inventoryRoutes.post(
  '/inventory/adjust',
  movesStock,
  validate('body', adjustSchema),
  asyncHandler(controller.adjust),
);

inventoryRoutes.patch(
  '/inventory/:id',
  movesStock,
  validate('params', idParamSchema),
  validate('body', reorderPointSchema),
  asyncHandler(controller.reorderPoint),
);
