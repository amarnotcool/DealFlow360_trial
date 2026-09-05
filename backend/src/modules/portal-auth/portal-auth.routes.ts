import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { portalAuth } from '../../middleware/portal-auth';
import { validate } from '../../middleware/validate';
import * as controller from './portal-auth.controller';
import { portalLoginSchema } from './portal-auth.schemas';

export const portalAuthRoutes = Router();

// The only portal route reachable without a portal session.
portalAuthRoutes.post(
  '/portal/auth/login',
  validate('body', portalLoginSchema),
  asyncHandler(controller.login),
);

portalAuthRoutes.get('/portal/auth/me', portalAuth, asyncHandler(controller.me));
