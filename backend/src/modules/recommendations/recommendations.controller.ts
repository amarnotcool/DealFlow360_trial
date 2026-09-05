// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import * as recommendationsService from './recommendations.service';

export async function list(req: Request, res: Response): Promise<void> {
  const { rows, total } = await recommendationsService.getRecommendations(req.params.id as string);
  res.json({ data: rows, error: null, meta: { total } });
}
