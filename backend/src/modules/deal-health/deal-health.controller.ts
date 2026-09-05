// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as dealHealthService from './deal-health.service';
import type { EscalateBody, ListQuery } from './deal-health.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const { rows, meta } = await dealHealthService.listAlerts(query);

  res.json({ data: rows, error: null, meta });
}

export async function scan(req: Request, res: Response): Promise<void> {
  const result = await dealHealthService.scanAlerts(currentUser(req).id);
  res.status(result.created > 0 ? 201 : 200).json({ data: result, error: null });
}

export async function acknowledge(req: Request, res: Response): Promise<void> {
  const alert = await dealHealthService.acknowledgeAlert(
    req.params.id as string,
    currentUser(req).id,
  );

  res.json({ data: alert, error: null });
}

export async function escalate(req: Request, res: Response): Promise<void> {
  const body = req.body as EscalateBody;
  const alert = await dealHealthService.escalateAlert(
    req.params.id as string,
    currentUser(req).id,
    body.note ?? null,
  );

  res.json({ data: alert, error: null });
}
