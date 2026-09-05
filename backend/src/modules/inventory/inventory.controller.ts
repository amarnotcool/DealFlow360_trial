// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as inventoryService from './inventory.service';
import type { AdjustBody, ListQuery, ReceiveBody, ReorderPointBody } from './inventory.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const { rows, total } = await inventoryService.listStock(query);

  res.json({ data: rows, error: null, meta: { total } });
}

export async function receive(req: Request, res: Response): Promise<void> {
  const result = await inventoryService.receiveStock(
    req.body as ReceiveBody,
    currentUser(req).id,
  );

  res.status(result.outcome === 'CREATED' ? 201 : 200).json({ data: result, error: null });
}

export async function adjust(req: Request, res: Response): Promise<void> {
  const result = await inventoryService.adjustStock(req.body as AdjustBody, currentUser(req).id);
  res.json({ data: result, error: null });
}

export async function reorderPoint(req: Request, res: Response): Promise<void> {
  const result = await inventoryService.setReorderPoint(
    req.params.id as string,
    req.body as ReorderPointBody,
    currentUser(req).id,
  );

  res.json({ data: result, error: null });
}
