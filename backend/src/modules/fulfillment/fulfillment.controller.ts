// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as fulfillmentService from './fulfillment.service';
import type {
  AcceptBody,
  BackorderListQuery,
  ConsolidateBody,
  ListQuery,
  OverrideBody,
} from './fulfillment.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const { rows, total, warehouses } = await fulfillmentService.listFulfillment({
    skip: query.skip,
    take: query.take,
  });

  res.json({ data: rows, error: null, meta: { total, warehouses } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const order = await fulfillmentService.getFulfillment(req.params.id as string);
  res.json({ data: order, error: null });
}

export async function suggest(req: Request, res: Response): Promise<void> {
  const order = await fulfillmentService.suggestSplit(req.params.id as string, currentUser(req).id);
  res.status(201).json({ data: order, error: null });
}

export async function accept(req: Request, res: Response): Promise<void> {
  const body = req.body as AcceptBody;
  const order = await fulfillmentService.acceptSplit(req.params.id as string, {
    actorUserId: currentUser(req).id,
    suggestionId: body.suggestionId ?? null,
  });
  res.json({ data: order, error: null });
}

export async function override(req: Request, res: Response): Promise<void> {
  const body = req.body as OverrideBody;
  const order = await fulfillmentService.overrideSplit(req.params.id as string, {
    actorUserId: currentUser(req).id,
    reason: body.reason ?? null,
    allocations: body.allocations,
  });
  res.json({ data: order, error: null });
}

export async function ship(req: Request, res: Response): Promise<void> {
  const order = await fulfillmentService.shipFulfillments(req.params.id as string, currentUser(req).id);
  res.json({ data: order, error: null });
}

export async function backorders(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as BackorderListQuery;
  const { rows, total } = await fulfillmentService.listBackorders({
    salesOrderId: query.salesOrderId,
    includeResolved: query.includeResolved,
    skip: query.skip,
    take: query.take,
  });

  res.json({ data: rows, error: null, meta: { total } });
}

export async function consolidate(req: Request, res: Response): Promise<void> {
  const body = req.body as ConsolidateBody;
  const result = await fulfillmentService.consolidateBackorders(
    req.params.id as string,
    currentUser(req).id,
    body.reason ?? null,
  );

  res.json({ data: result, error: null });
}
