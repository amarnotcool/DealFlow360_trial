// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import { generateRecurringInvoice } from '../billing/billing.service';
import * as subscriptionsService from './subscriptions.service';
import type { CancelBody, ChangeBody, ListQuery } from './subscriptions.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const { rows, total, counts } = await subscriptionsService.listSubscriptions({
    status: query.status,
    skip: query.skip,
    take: query.take,
  });

  res.json({ data: rows, error: null, meta: { total, counts } });
}

export async function plans(_req: Request, res: Response): Promise<void> {
  const rows = await subscriptionsService.listSubscriptionPlans();
  res.json({ data: rows, error: null, meta: { total: rows.length } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const subscription = await subscriptionsService.getSubscription(req.params.id as string);
  res.json({ data: subscription, error: null });
}

export async function change(req: Request, res: Response): Promise<void> {
  const body = req.body as ChangeBody;
  const subscription = await subscriptionsService.changeSubscription(req.params.id as string, {
    actorUserId: currentUser(req).id,
    subscriptionPlanId: body.subscriptionPlanId ?? null,
    quantity: body.quantity ?? null,
    effectiveDate: body.effectiveDate ?? null,
    notes: body.notes ?? null,
  });

  res.json({ data: subscription, error: null });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const body = req.body as CancelBody;
  const subscription = await subscriptionsService.cancelSubscription(req.params.id as string, {
    actorUserId: currentUser(req).id,
    reason: body.reason ?? null,
    effectiveDate: body.effectiveDate ?? null,
  });

  res.json({ data: subscription, error: null });
}

/** The demo trigger: bills the open period instead of waiting for a cron. */
export async function generateInvoice(req: Request, res: Response): Promise<void> {
  const invoice = await generateRecurringInvoice(req.params.id as string, currentUser(req).id);
  res.status(201).json({ data: invoice, error: null });
}
