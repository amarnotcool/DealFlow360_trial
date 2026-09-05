import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './rbac.controller';
import { createUserSchema, idParamSchema, listQuerySchema, updateUserSchema } from './rbac.schemas';

export const rbacRoutes = Router();

// Who may sign in, and as what, is admin-only in full (specs.md §2).
const managesStaff = requireRole('ADMIN');

// Path-scoped so these never run for another module's routes.
rbacRoutes.use('/users', auth, managesStaff);
rbacRoutes.use('/roles', auth, managesStaff);

rbacRoutes.get('/users', validate('query', listQuerySchema), asyncHandler(controller.list));

rbacRoutes.get('/users/:id', validate('params', idParamSchema), asyncHandler(controller.detail));

rbacRoutes.post('/users', validate('body', createUserSchema), asyncHandler(controller.create));

rbacRoutes.patch(
  '/users/:id',
  validate('params', idParamSchema),
  validate('body', updateUserSchema),
  asyncHandler(controller.update),
);

// Deactivates the account; a staff user is never deleted.
rbacRoutes.delete(
  '/users/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.deactivate),
);

// The role picker behind user create and edit — read only.
rbacRoutes.get('/roles', asyncHandler(controller.roles));
