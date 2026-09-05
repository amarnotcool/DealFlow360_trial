// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import * as warehousesService from './warehouses.service';
import type { ListQuery } from './warehouses.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const rows = await warehousesService.listWarehouses(query.includeInactive);

  res.json({ data: rows, error: null, meta: { total: rows.length } });
}
