import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { validate } from '../../middleware/validate';
import * as controller from './approvals.controller';
import { decisionSchema, idParamSchema, listQuerySchema } from './approvals.schemas';

export const approvalsRoutes = Router();

approvalsRoutes.get('/approvals', validate('query', listQuerySchema), asyncHandler(controller.list));

approvalsRoutes.get(
  '/approvals/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

approvalsRoutes.post(
  '/approvals/:id/approve',
  validate('params', idParamSchema),
  validate('body', decisionSchema),
  asyncHandler(controller.approve),
);

approvalsRoutes.post(
  '/approvals/:id/reject',
  validate('params', idParamSchema),
  validate('body', decisionSchema),
  asyncHandler(controller.reject),
);

approvalsRoutes.post(
  '/approvals/:id/return',
  validate('params', idParamSchema),
  validate('body', decisionSchema),
  asyncHandler(controller.returnForRevision),
);
