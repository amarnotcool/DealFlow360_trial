// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as negotiationService from './negotiation.service';
import type { RespondBody } from './negotiation.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const { rows, meta } = await negotiationService.listForQuotation(req.params.id as string);

  res.json({ data: rows, error: null, meta });
}

export async function respond(req: Request, res: Response): Promise<void> {
  const body = req.body as RespondBody;
  const result = await negotiationService.respond(
    req.params.id as string,
    currentUser(req).id,
    body,
  );

  res.json({ data: result, error: null });
}
