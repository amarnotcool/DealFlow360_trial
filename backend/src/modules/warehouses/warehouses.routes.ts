import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './warehouses.controller';
import { listQuerySchema } from './warehouses.schemas';

export const warehousesRoutes = Router();

// Read-only for every signed-in user; creating warehouses is not in scope.
warehousesRoutes.use('/warehouses', auth);

warehousesRoutes.get('/warehouses', validate('query', listQuerySchema), asyncHandler(controller.list));
