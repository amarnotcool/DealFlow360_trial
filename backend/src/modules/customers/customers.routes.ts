import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './customers.controller';
import {
  contactParamsSchema,
  createContactSchema,
  createCustomerSchema,
  idParamSchema,
  listQuerySchema,
  updateContactSchema,
  updateCustomerSchema,
} from './customers.schemas';

export const customersRoutes = Router();

// Reps own the customer relationship, so they maintain the book alongside
// admins; finance and managers read it (specs.md §2).
const keepsTheBook = requireRole('SALES_REP', 'ADMIN');

// Path-scoped so these never run for another module's routes.
customersRoutes.use('/customers', auth);
customersRoutes.use('/customer-tiers', auth);

customersRoutes.get('/customers', validate('query', listQuerySchema), asyncHandler(controller.list));

customersRoutes.get(
  '/customers/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

customersRoutes.post(
  '/customers',
  keepsTheBook,
  validate('body', createCustomerSchema),
  asyncHandler(controller.create),
);

customersRoutes.patch(
  '/customers/:id',
  keepsTheBook,
  validate('params', idParamSchema),
  validate('body', updateCustomerSchema),
  asyncHandler(controller.update),
);

customersRoutes.post(
  '/customers/:id/contacts',
  keepsTheBook,
  validate('params', idParamSchema),
  validate('body', createContactSchema),
  asyncHandler(controller.createContact),
);

customersRoutes.patch(
  '/customers/:id/contacts/:contactId',
  keepsTheBook,
  validate('params', contactParamsSchema),
  validate('body', updateContactSchema),
  asyncHandler(controller.updateContact),
);

// Deletes a contact nothing has used, deactivates one history depends on.
customersRoutes.delete(
  '/customers/:id/contacts/:contactId',
  keepsTheBook,
  validate('params', contactParamsSchema),
  asyncHandler(controller.removeContact),
);

// The tier picker behind customer create and edit — read only.
customersRoutes.get('/customer-tiers', asyncHandler(controller.tiers));
