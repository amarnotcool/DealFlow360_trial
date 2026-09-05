// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import * as billingService from './billing.service';
import type { ListQuery, PaymentBody } from './billing.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const { rows, total, counts } = await billingService.listInvoices({
    status: query.status,
    type: query.type,
    skip: query.skip,
    take: query.take,
  });

  res.json({ data: rows, error: null, meta: { total, counts } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const invoice = await billingService.getInvoice(req.params.id as string);
  res.json({ data: invoice, error: null });
}

/** Screen 13: one order's one-time and recurring streams, side by side. */
export async function orderBilling(req: Request, res: Response): Promise<void> {
  const billing = await billingService.getOrderBilling(req.params.id as string);
  res.json({ data: billing, error: null });
}

export async function pay(req: Request, res: Response): Promise<void> {
  const body = req.body as PaymentBody;
  const invoice = await billingService.recordPayment(req.params.id as string, {
    actorUserId: body.actorUserId,
    amount: body.amount,
    method: body.method,
    reference: body.reference ?? null,
  });

  res.status(201).json({ data: invoice, error: null });
}
