// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as discountTiersService from './discount-tiers.service';
import type { UpdateCeilingBody } from './discount-tiers.schemas';

export async function list(_req: Request, res: Response): Promise<void> {
  const { data, meta } = await discountTiersService.listDiscountConfig();
  res.json({ data, error: null, meta });
}

export async function updateCeiling(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateCeilingBody;
  const rule = await discountTiersService.updateDiscountRuleCeiling(
    req.params.id as string,
    body.ceilingPct,
    currentUser(req).id,
    body.reason ?? null,
  );

  res.json({ data: rule, error: null });
}
