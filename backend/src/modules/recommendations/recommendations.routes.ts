import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './recommendations.controller';
import { recommendationParamsSchema } from './recommendations.schemas';

export const recommendationsRoutes = Router();

// Reading a quote's suggestions needs what reading the quote needs: a
// session, nothing more. The guard rides on the route itself so this router
// never touches a request meant for another module.
recommendationsRoutes.get(
  '/quotations/:id/recommendations',
  auth,
  validate('params', recommendationParamsSchema),
  asyncHandler(controller.list),
);
