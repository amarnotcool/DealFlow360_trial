// HTTP layer only: read the parsed request, call the service, shape the response.
//
// The acting user comes from the session on every write, so the audit log always
// names the person who was signed in.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as quotationsService from './quotations.service';
import type { CreateQuotationBody, LineBody, ListQuery, UpdateLineBody } from './quotations.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const { rows, total } = await quotationsService.listQuotations({
    status: query.status,
    skip: query.skip,
    take: query.take,
  });

  res.json({ data: rows, error: null, meta: { total } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const quotation = await quotationsService.getQuotation(req.params.id as string);
  res.json({ data: quotation, error: null });
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateQuotationBody;
  const actor = currentUser(req);
  // A rep owns the quotes they open; ownership is not something the client picks.
  const quotation = await quotationsService.createQuotation({
    ...body,
    ownerUserId: actor.id,
    actorUserId: actor.id,
  });
  res.status(201).json({ data: quotation, error: null });
}

export async function addLine(req: Request, res: Response): Promise<void> {
  const line = req.body as LineBody;
  const quotation = await quotationsService.addLine(
    req.params.id as string,
    line,
    currentUser(req).id,
  );
  res.status(201).json({ data: quotation, error: null });
}

export async function updateLine(req: Request, res: Response): Promise<void> {
  const changes = req.body as UpdateLineBody;
  const quotation = await quotationsService.updateLine(
    req.params.id as string,
    req.params.lineId as string,
    changes,
    currentUser(req).id,
  );
  res.json({ data: quotation, error: null });
}

export async function removeLine(req: Request, res: Response): Promise<void> {
  const quotation = await quotationsService.deleteLine(
    req.params.id as string,
    req.params.lineId as string,
    currentUser(req).id,
  );
  res.json({ data: quotation, error: null });
}

export async function submit(req: Request, res: Response): Promise<void> {
  const quotation = await quotationsService.submitQuotation(
    req.params.id as string,
    currentUser(req).id,
  );
  res.json({ data: quotation, error: null });
}

export async function confirm(req: Request, res: Response): Promise<void> {
  const salesOrder = await quotationsService.confirmQuotation(
    req.params.id as string,
    currentUser(req).id,
  );
  res.status(201).json({ data: salesOrder, error: null });
}
