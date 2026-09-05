// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as warehousesService from './warehouses.service';
import type { CreateWarehouseBody, ListQuery, UpdateWarehouseBody } from './warehouses.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const rows = await warehousesService.listWarehouses(query.includeInactive);

  res.json({ data: rows, error: null, meta: { total: rows.length } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const warehouse = await warehousesService.getWarehouse(req.params.id as string);
  res.json({ data: warehouse, error: null });
}

export async function create(req: Request, res: Response): Promise<void> {
  const warehouse = await warehousesService.createWarehouse(
    req.body as CreateWarehouseBody,
    currentUser(req).id,
  );

  res.status(201).json({ data: warehouse, error: null });
}

export async function update(req: Request, res: Response): Promise<void> {
  const warehouse = await warehousesService.updateWarehouse(
    req.params.id as string,
    req.body as UpdateWarehouseBody,
    currentUser(req).id,
  );

  res.json({ data: warehouse, error: null });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const result = await warehousesService.deactivateWarehouse(
    req.params.id as string,
    currentUser(req).id,
  );

  res.json({ data: result, error: null });
}
