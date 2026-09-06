import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './discount-tiers.controller';
import { idParamSchema, updateCeilingSchema } from './discount-tiers.schemas';

export const discountTiersRoutes = Router();

// What the ceilings are is readable by everyone signed in — a rep pricing a
// line is scored against them. Changing one is policy, and policy is admin
// work (specs.md §2, screen 18).
const ownsThePolicy = requireRole('ADMIN');

// Path-scoped so these never run for another module's routes.
discountTiersRoutes.use('/discount-rules', auth);

discountTiersRoutes.get('/discount-rules', asyncHandler(controller.list));

discountTiersRoutes.patch(
  '/discount-rules/:id',
  ownsThePolicy,
  validate('params', idParamSchema),
  validate('body', updateCeilingSchema),
  asyncHandler(controller.updateCeiling),
);
