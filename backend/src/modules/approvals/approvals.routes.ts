import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './approvals.controller';
import { decisionSchema, idParamSchema, listQuerySchema } from './approvals.schemas';

export const approvalsRoutes = Router();

// specs.md §2: the approval desk belongs to Sales Manager and Finance; a rep
// never sees it. Deciding a step also has to match that step's own level, which
// the service checks.
const seesDesk = requireRole('SALES_MANAGER', 'FINANCE', 'ADMIN');
const decides = requireRole('SALES_MANAGER', 'FINANCE');

approvalsRoutes.use('/approvals', auth);

approvalsRoutes.get('/approvals', seesDesk, validate('query', listQuerySchema), asyncHandler(controller.list));

approvalsRoutes.get(
  '/approvals/:id',
  seesDesk,
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

approvalsRoutes.post(
  '/approvals/:id/approve',
  decides,
  validate('params', idParamSchema),
  validate('body', decisionSchema),
  asyncHandler(controller.approve),
);

approvalsRoutes.post(
  '/approvals/:id/reject',
  decides,
  validate('params', idParamSchema),
  validate('body', decisionSchema),
  asyncHandler(controller.reject),
);

approvalsRoutes.post(
  '/approvals/:id/return',
  decides,
  validate('params', idParamSchema),
  validate('body', decisionSchema),
  asyncHandler(controller.returnForRevision),
);
