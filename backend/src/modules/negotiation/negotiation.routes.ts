import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './negotiation.controller';
import { quotationParamSchema, requestParamSchema, respondSchema } from './negotiation.schemas';

export const negotiationRoutes = Router();

// specs.md §2 gives the Sales Rep "respond to negotiation requests"; a manager
// and an admin answer the same desk. Finance reads a quote but does not haggle
// over its discounts — that is the sales side of the conversation.
const answersCustomers = requireRole('SALES_REP', 'SALES_MANAGER', 'ADMIN');

// Reading the thread needs only what reading the quotation needs: a session.
// The guard rides on each route so this router never answers for another
// module's path — a bare `use(auth)` would.
negotiationRoutes.get(
  '/quotations/:id/negotiations',
  auth,
  validate('params', quotationParamSchema),
  asyncHandler(controller.list),
);

negotiationRoutes.post(
  '/negotiation-requests/:id/respond',
  auth,
  answersCustomers,
  validate('params', requestParamSchema),
  validate('body', respondSchema),
  asyncHandler(controller.respond),
);
