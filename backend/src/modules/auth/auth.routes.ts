import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './auth.controller';
import { loginSchema } from './auth.schemas';

export const authRoutes = Router();

// The only internal route that is reachable without a session.
authRoutes.post('/auth/login', validate('body', loginSchema), asyncHandler(controller.login));

authRoutes.get('/auth/me', auth, asyncHandler(controller.me));
