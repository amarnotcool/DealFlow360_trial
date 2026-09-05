// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentPortalUser } from '../../middleware/portal-auth';
import * as portalService from './portal.service';
import type { NegotiateBody } from './portal.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const { rows, total } = await portalService.listQuotations(currentPortalUser(req));
  res.json({ data: rows, error: null, meta: { total } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const quotation = await portalService.getQuotation(req.params.id as string, currentPortalUser(req));
  res.json({ data: quotation, error: null });
}

export async function negotiate(req: Request, res: Response): Promise<void> {
  const { requests } = req.body as NegotiateBody;
  const quotation = await portalService.negotiate(
    req.params.id as string,
    currentPortalUser(req),
    requests,
  );
  res.status(201).json({ data: quotation, error: null });
}

export async function confirm(req: Request, res: Response): Promise<void> {
  const session = currentPortalUser(req);
  const summary = await portalService.confirm(req.params.id as string, session);
  const quotation = await portalService.getQuotation(req.params.id as string, session);

  res.json({ data: { ...summary, quotation }, error: null });
}
