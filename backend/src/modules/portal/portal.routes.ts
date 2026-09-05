import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { portalAuth } from '../../middleware/portal-auth';
import { validate } from '../../middleware/validate';
import * as controller from './portal.controller';
import { idParamSchema, negotiateSchema } from './portal.schemas';

export const portalRoutes = Router();

// CLAUDE.md rule 4: the portal is its own surface. Everything here sits behind
// portal-auth, and nothing here is reachable with an internal staff token.
portalRoutes.use('/portal', portalAuth);

portalRoutes.get('/portal/quotations', asyncHandler(controller.list));

portalRoutes.get(
  '/portal/quotations/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

portalRoutes.post(
  '/portal/quotations/:id/negotiate',
  validate('params', idParamSchema),
  validate('body', negotiateSchema),
  asyncHandler(controller.negotiate),
);

// specs.md §4: over a ceiling this re-enters approval by itself, otherwise it
// moves straight to fulfillment.
portalRoutes.post(
  '/portal/quotations/:id/confirm',
  validate('params', idParamSchema),
  asyncHandler(controller.confirm),
);
