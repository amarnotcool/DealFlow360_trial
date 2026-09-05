// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentPortalUser } from '../../middleware/portal-auth';
import * as portalAuthService from './portal-auth.service';
import type { PortalLoginBody } from './portal-auth.schemas';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as PortalLoginBody;
  const session = await portalAuthService.login(email, password);
  res.json({ data: session, error: null });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await portalAuthService.getMe(currentPortalUser(req).contactId);
  res.json({ data: user, error: null });
}
