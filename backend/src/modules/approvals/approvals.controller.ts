// HTTP layer only: parse, delegate, respond.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as approvalsService from './approvals.service';
import type { DecisionBody, ListQuery } from './approvals.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const { data, total, counts } = await approvalsService.listApprovals({
    skip: query.skip,
    take: query.take,
  });

  res.json({ data, error: null, meta: { total, counts } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const approval = await approvalsService.getApprovalDetail(req.params.id as string);
  res.json({ data: approval, error: null });
}

export async function approve(req: Request, res: Response): Promise<void> {
  const body = req.body as DecisionBody;
  const actor = currentUser(req);
  const quotation = await approvalsService.approve(req.params.id as string, {
    ...body,
    actorUserId: actor.id,
    actorRole: actor.role,
  });
  res.json({ data: quotation, error: null });
}

export async function reject(req: Request, res: Response): Promise<void> {
  const body = req.body as DecisionBody;
  const actor = currentUser(req);
  const quotation = await approvalsService.reject(req.params.id as string, {
    ...body,
    actorUserId: actor.id,
    actorRole: actor.role,
  });
  res.json({ data: quotation, error: null });
}

export async function returnForRevision(req: Request, res: Response): Promise<void> {
  const body = req.body as DecisionBody;
  const actor = currentUser(req);
  const quotation = await approvalsService.returnForRevision(req.params.id as string, {
    ...body,
    actorUserId: actor.id,
    actorRole: actor.role,
  });
  res.json({ data: quotation, error: null });
}
