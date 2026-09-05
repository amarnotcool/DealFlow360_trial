// Subscription business logic and Prisma access.
//
// The proration maths is NOT repeated here: the current terms, the new terms and
// the cycle window are read from the database, handed to the pure engine in
// proration.ts, and its result is persisted. Nothing in this file works out a
// prorated amount itself.

import {
  AuditAction,
  BillingCycle,
  BillingScheduleStatus,
  CreditNoteReason,
  CreditNoteStatus,
  InvoiceType,
  LineType,
  Prisma,
  ProrationType,
  SubscriptionStatus,
} from '@prisma/client';
import type { ProrationResult } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import { nextCreditNoteNumber } from '../billing/billing.numbers';
import { DAYS_IN_CYCLE, computeProration } from './proration';

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Payment terms for a generated invoice, in days from issue. */
export const PAYMENT_TERM_DAYS = 15;

const subscriptionDetailInclude = {
  customer: { select: { id: true, code: true, name: true } },
  subscriptionPlan: true,
  salesOrder: { select: { id: true, number: true, status: true } },
  // Two changes can share an effective date, so the newest write wins the tie.
  prorationEvents: { orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }] },
  billingSchedules: { orderBy: { periodStart: 'asc' } },
  invoices: { orderBy: { createdAt: 'desc' } },
  creditNotes: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.SubscriptionInclude;

type SubscriptionDetail = Prisma.SubscriptionGetPayload<{ include: typeof subscriptionDetailInclude }>;

// ---------------------------------------------------------------------------
// Cycle helpers
// ---------------------------------------------------------------------------

/** The end of one billing period that starts on `from`. */
export function addCycle(from: Date, cycle: BillingCycle): Date {
  const next = new Date(from);
  if (cycle === BillingCycle.MONTHLY) next.setMonth(next.getMonth() + 1);
  else if (cycle === BillingCycle.QUARTERLY) next.setMonth(next.getMonth() + 3);
  else next.setFullYear(next.getFullYear() + 1);
  return next;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/**
 * Whole days left in the cycle at `on`, clamped to the cycle length the
 * proration engine prices against.
 */
function remainingDays(on: Date, cycleEnd: Date, daysInCycle: number): number {
  const raw = Math.ceil((cycleEnd.getTime() - on.getTime()) / MS_PER_DAY);
  return Math.min(Math.max(raw, 0), daysInCycle);
}

// ---------------------------------------------------------------------------
// Creation — driven by the confirm step (quotation → sales order)
// ---------------------------------------------------------------------------

/**
 * Turns every RECURRING line of a freshly confirmed order into a subscription,
 * with its first billing period scheduled. Called from confirmQuotation so the
 * one confirm action produces both the order and its subscriptions.
 */
export async function createSubscriptionsForOrder(
  tx: Prisma.TransactionClient,
  salesOrderId: string,
  actorUserId: string,
): Promise<string[]> {
  const order = await tx.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: {
      lines: {
        where: { lineType: LineType.RECURRING },
        orderBy: { sequence: 'asc' },
        include: { quotationLine: { select: { subscriptionPlanId: true } } },
      },
    },
  });

  if (!order) {
    throw new NotFoundError('Sales order', salesOrderId);
  }

  const created: string[] = [];

  for (const line of order.lines) {
    const planId = line.quotationLine?.subscriptionPlanId;
    if (!planId) {
      throw new ConflictError(
        `Recurring line ${line.id} has no subscription plan — a recurring line must name the plan it bills on`,
      );
    }

    const plan = await tx.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundError('Subscription plan', planId);
    }

    const startDate = order.orderDate;
    const periodEnd = addCycle(startDate, plan.billingCycle);
    const recurringAmount = line.unitPrice.mul(line.quantity).toDecimalPlaces(2);

    const subscription = await tx.subscription.create({
      data: {
        customerId: order.customerId,
        salesOrderId: order.id,
        quotationLineId: line.quotationLineId,
        subscriptionPlanId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        billingCycle: plan.billingCycle,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        recurringAmount,
        startDate,
        nextBillingDate: periodEnd,
      },
    });

    // The first period is scheduled straight away, so the demo trigger has
    // something to invoice without waiting for a cycle to roll over.
    await tx.billingSchedule.create({
      data: {
        subscriptionId: subscription.id,
        salesOrderId: order.id,
        invoiceType: InvoiceType.RECURRING,
        status: BillingScheduleStatus.SCHEDULED,
        periodStart: startDate,
        periodEnd,
        dueDate: addDays(periodEnd, PAYMENT_TERM_DAYS),
        amount: recurringAmount,
      },
    });

    await recordAudit(tx, {
      entityType: 'subscription',
      entityId: subscription.id,
      action: AuditAction.CREATE,
      userId: actorUserId,
      reason: `Created from ${order.number} on confirm`,
      changes: {
        salesOrderId: order.id,
        plan: plan.code,
        quantity: line.quantity.toString(),
        recurringAmount: recurringAmount.toString(),
      },
    });

    created.push(subscription.id);
  }

  return created;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListSubscriptionsParams {
  status?: SubscriptionStatus;
  skip: number;
  take: number;
}

/** Screen 9: every subscription, with the Active / Paused / Cancelled counts. */
export async function listSubscriptions(params: ListSubscriptionsParams) {
  const where: Prisma.SubscriptionWhereInput = params.status ? { status: params.status } : {};

  const [rows, total, grouped] = await Promise.all([
    prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
      include: {
        customer: { select: { id: true, code: true, name: true } },
        subscriptionPlan: { select: { id: true, code: true, name: true, billingCycle: true } },
        salesOrder: { select: { id: true, number: true } },
        _count: { select: { invoices: true, prorationEvents: true } },
      },
    }),
    prisma.subscription.count({ where }),
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const countFor = (status: SubscriptionStatus) =>
    grouped.find((row) => row.status === status)?._count._all ?? 0;

  return {
    rows,
    total,
    counts: {
      active: countFor(SubscriptionStatus.ACTIVE),
      paused: countFor(SubscriptionStatus.PAUSED),
      cancelled: countFor(SubscriptionStatus.CANCELLED),
    },
  };
}

/** The plans a subscription can move to — the change form reads this list. */
export async function listSubscriptionPlans() {
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { recurringPrice: 'asc' },
  });
}

export async function getSubscription(id: string): Promise<SubscriptionDetail> {
  const subscription = await prisma.subscription.findUnique({
    where: { id },
    include: subscriptionDetailInclude,
  });

  if (!subscription) {
    throw new NotFoundError('Subscription', id);
  }

  return subscription;
}

// ---------------------------------------------------------------------------
// Change — plan or quantity, mid cycle
// ---------------------------------------------------------------------------

export interface ChangeSubscriptionInput {
  actorUserId: string;
  subscriptionPlanId?: string | null;
  quantity?: number | null;
  effectiveDate?: string | null;
  notes?: string | null;
}

function resolveProrationType(
  oldUnitPrice: Prisma.Decimal,
  newUnitPrice: Prisma.Decimal,
  oldQuantity: Prisma.Decimal,
  newQuantity: Prisma.Decimal,
): ProrationType {
  if (newUnitPrice.greaterThan(oldUnitPrice)) return ProrationType.UPGRADE;
  if (newUnitPrice.lessThan(oldUnitPrice)) return ProrationType.DOWNGRADE;
  if (!newQuantity.equals(oldQuantity)) return ProrationType.QUANTITY_CHANGE;
  return ProrationType.QUANTITY_CHANGE;
}

/**
 * Applies a mid-cycle plan or quantity change: the engine prices the remaining
 * days, a proration_event records it, and a credit lands as a credit note.
 */
export async function changeSubscription(id: string, input: ChangeSubscriptionInput) {
  await prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({ where: { id } });
    if (!subscription) {
      throw new NotFoundError('Subscription', id);
    }
    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new ConflictError('A cancelled subscription cannot be changed');
    }
    if (input.subscriptionPlanId == null && input.quantity == null) {
      throw new ValidationError('A change needs a new plan, a new quantity, or both');
    }

    const plan = input.subscriptionPlanId
      ? await tx.subscriptionPlan.findUnique({ where: { id: input.subscriptionPlanId } })
      : await tx.subscriptionPlan.findUnique({ where: { id: subscription.subscriptionPlanId } });

    if (!plan) {
      throw new NotFoundError('Subscription plan', input.subscriptionPlanId ?? subscription.subscriptionPlanId);
    }

    const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date();
    const cycleEnd = subscription.nextBillingDate ?? addCycle(subscription.startDate, subscription.billingCycle);
    const daysInCycle = DAYS_IN_CYCLE[subscription.billingCycle];

    const newQuantity = input.quantity == null ? subscription.quantity : D(input.quantity);
    const newUnitPrice = plan.recurringPrice;

    const proration: ProrationResult = computeProration({
      type: resolveProrationType(subscription.unitPrice, newUnitPrice, subscription.quantity, newQuantity),
      oldPlanPrice: subscription.unitPrice.toNumber(),
      oldQuantity: subscription.quantity.toNumber(),
      newPlanPrice: newUnitPrice.toNumber(),
      newQuantity: newQuantity.toNumber(),
      daysInCycle,
      remainingDays: remainingDays(effectiveDate, cycleEnd, daysInCycle),
    });

    const type = resolveProrationType(
      subscription.unitPrice,
      newUnitPrice,
      subscription.quantity,
      newQuantity,
    );

    const event = await tx.prorationEvent.create({
      data: {
        subscriptionId: id,
        type,
        effectiveDate,
        previousQuantity: subscription.quantity,
        newQuantity,
        previousUnitPrice: subscription.unitPrice,
        newUnitPrice,
        proratedAmount: D(proration.prorationAmount),
        creditAmount: D(proration.creditAmount),
        createdByUserId: input.actorUserId,
        notes:
          input.notes ??
          `${proration.remainingDays} of ${proration.daysInCycle} days re-priced from ${proration.oldEffectivePrice} to ${proration.newEffectivePrice}`,
      },
    });

    if (proration.creditAmount > 0) {
      await tx.creditNote.create({
        data: {
          number: await nextCreditNoteNumber(tx),
          customerId: subscription.customerId,
          subscriptionId: id,
          prorationEventId: event.id,
          status: CreditNoteStatus.ISSUED,
          reason: CreditNoteReason.PRORATION_ADJUSTMENT,
          amount: D(proration.creditAmount),
          issuedAt: new Date(),
          notes: `Downgrade credit for ${proration.remainingDays} unused days`,
        },
      });
    }

    const recurringAmount = newUnitPrice.mul(newQuantity).toDecimalPlaces(2);

    await tx.subscription.update({
      where: { id },
      data: {
        subscriptionPlanId: plan.id,
        billingCycle: plan.billingCycle,
        quantity: newQuantity,
        unitPrice: newUnitPrice,
        recurringAmount,
      },
    });

    // The open period is re-priced too: it now bills the new terms.
    await tx.billingSchedule.updateMany({
      where: { subscriptionId: id, status: BillingScheduleStatus.SCHEDULED },
      data: { amount: recurringAmount },
    });

    await recordAudit(tx, {
      entityType: 'subscription',
      entityId: id,
      action: AuditAction.UPDATE,
      userId: input.actorUserId,
      reason: `${type} — prorated ${proration.prorationAmount} (${proration.direction})`,
      changes: {
        before: { plan: subscription.subscriptionPlanId, quantity: subscription.quantity.toString(), unitPrice: subscription.unitPrice.toString() },
        after: { plan: plan.id, quantity: newQuantity.toString(), unitPrice: newUnitPrice.toString() },
        prorationEventId: event.id,
      },
    });
  });

  return getSubscription(id);
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export interface CancelSubscriptionInput {
  actorUserId: string;
  reason?: string | null;
  effectiveDate?: string | null;
}

/** Cancels the subscription and credits the part of the cycle it will not use. */
export async function cancelSubscription(id: string, input: CancelSubscriptionInput) {
  await prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({ where: { id } });
    if (!subscription) {
      throw new NotFoundError('Subscription', id);
    }
    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new ConflictError('Subscription is already cancelled');
    }

    const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date();
    const cycleEnd = subscription.nextBillingDate ?? addCycle(subscription.startDate, subscription.billingCycle);
    const daysInCycle = DAYS_IN_CYCLE[subscription.billingCycle];

    const proration = computeProration({
      type: ProrationType.CANCELLATION,
      oldPlanPrice: subscription.unitPrice.toNumber(),
      oldQuantity: subscription.quantity.toNumber(),
      newPlanPrice: 0,
      newQuantity: 0,
      daysInCycle,
      remainingDays: remainingDays(effectiveDate, cycleEnd, daysInCycle),
    });

    const event = await tx.prorationEvent.create({
      data: {
        subscriptionId: id,
        type: ProrationType.CANCELLATION,
        effectiveDate,
        previousQuantity: subscription.quantity,
        newQuantity: D(0),
        previousUnitPrice: subscription.unitPrice,
        newUnitPrice: D(0),
        proratedAmount: D(proration.prorationAmount),
        creditAmount: D(proration.creditAmount),
        createdByUserId: input.actorUserId,
        notes: `Cancelled with ${proration.remainingDays} of ${proration.daysInCycle} days unused`,
      },
    });

    // A credit note is only raised where there is something to give back.
    if (proration.creditAmount > 0) {
      await tx.creditNote.create({
        data: {
          number: await nextCreditNoteNumber(tx),
          customerId: subscription.customerId,
          subscriptionId: id,
          prorationEventId: event.id,
          status: CreditNoteStatus.ISSUED,
          reason: CreditNoteReason.CANCELLATION,
          amount: D(proration.creditAmount),
          issuedAt: new Date(),
          notes: input.reason ?? 'Cancellation credit for the unused part of the cycle',
        },
      });
    }

    await tx.billingSchedule.updateMany({
      where: { subscriptionId: id, status: BillingScheduleStatus.SCHEDULED },
      data: { status: BillingScheduleStatus.CANCELLED },
    });

    await tx.subscription.update({
      where: { id },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelledAt: effectiveDate,
        endDate: effectiveDate,
        cancellationReason: input.reason ?? null,
        nextBillingDate: null,
      },
    });

    await recordAudit(tx, {
      entityType: 'subscription',
      entityId: id,
      action: AuditAction.CANCEL,
      userId: input.actorUserId,
      reason: input.reason ?? 'Cancelled',
      changes: { creditAmount: proration.creditAmount, prorationEventId: event.id },
    });
  });

  return getSubscription(id);
}
