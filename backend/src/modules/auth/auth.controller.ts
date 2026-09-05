// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as authService from './auth.service';
import type { LoginBody } from './auth.schemas';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as LoginBody;
  const session = await authService.login(email, password);
  res.json({ data: session, error: null });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.getMe(currentUser(req).id);
  res.json({ data: user, error: null });
}
