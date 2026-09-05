// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import * as quotationsService from './quotations.service';
import type {
  CreateQuotationBody,
  LineBody,
  ListQuery,
  UpdateLineBody,
  ActorBody,
} from './quotations.schemas';

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
  const quotation = await quotationsService.createQuotation(body);
  res.status(201).json({ data: quotation, error: null });
}

export async function addLine(req: Request, res: Response): Promise<void> {
  const { actorUserId, ...line } = req.body as LineBody;
  const quotation = await quotationsService.addLine(req.params.id as string, line, actorUserId);
  res.status(201).json({ data: quotation, error: null });
}

export async function updateLine(req: Request, res: Response): Promise<void> {
  const { actorUserId, ...changes } = req.body as UpdateLineBody;
  const quotation = await quotationsService.updateLine(
    req.params.id as string,
    req.params.lineId as string,
    changes,
    actorUserId,
  );
  res.json({ data: quotation, error: null });
}

export async function removeLine(req: Request, res: Response): Promise<void> {
  const { actorUserId } = req.body as ActorBody;
  const quotation = await quotationsService.deleteLine(
    req.params.id as string,
    req.params.lineId as string,
    actorUserId,
  );
  res.json({ data: quotation, error: null });
}

export async function submit(req: Request, res: Response): Promise<void> {
  const { actorUserId } = req.body as ActorBody;
  const quotation = await quotationsService.submitQuotation(req.params.id as string, actorUserId);
  res.json({ data: quotation, error: null });
}

export async function confirm(req: Request, res: Response): Promise<void> {
  const { actorUserId } = req.body as ActorBody;
  const salesOrder = await quotationsService.confirmQuotation(req.params.id as string, actorUserId);
  res.status(201).json({ data: salesOrder, error: null });
}
