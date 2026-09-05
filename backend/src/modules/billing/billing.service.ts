// Invoicing, payments and the billing reconciliation rule.
//
// specs.md §4: "Partial invoicing must stay reconciled with partial delivery —
// nothing is billed before it ships." So a one-time line is invoiced from what a
// shipment actually carried, never from what was ordered; a backordered quantity
// stays uninvoiced until it ships.
//
// Recurring lines do not ship, so they bill on their schedule instead. The two
// streams never share an invoice: every invoice is ONE_TIME or RECURRING.

import {
  AuditAction,
  BillingScheduleStatus,
  FulfillmentStatus,
  InvoiceStatus,
  InvoiceType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import { PAYMENT_TERM_DAYS, addCycle, addDays } from '../subscriptions/subscriptions.service';
import { nextInvoiceNumber } from './billing.numbers';

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

const invoiceDetailInclude = {
  customer: { select: { id: true, code: true, name: true } },
  salesOrder: { select: { id: true, number: true, status: true } },
  subscription: {
    select: {
      id: true,
      status: true,
      billingCycle: true,
      subscriptionPlan: { select: { id: true, code: true, name: true } },
    },
  },
  lines: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
  creditNotes: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.InvoiceInclude;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListInvoicesParams {
  status?: InvoiceStatus;
  type?: InvoiceType;
  skip: number;
  take: number;
}

/** Screen 12: every invoice, with the Unpaid / Paid counts. */
export async function listInvoices(params: ListInvoicesParams) {
  const where: Prisma.InvoiceWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.type ? { type: params.type } : {}),
  };

  const [rows, total, grouped, outstanding] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
      include: {
        customer: { select: { id: true, code: true, name: true } },
        salesOrder: { select: { id: true, number: true } },
        subscription: { select: { id: true, subscriptionPlan: { select: { code: true, name: true } } } },
        _count: { select: { lines: true, payments: true } },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.invoice.aggregate({ _sum: { balanceAmount: true, totalAmount: true, paidAmount: true } }),
  ]);

  const countFor = (status: InvoiceStatus) =>
    grouped.find((row) => row.status === status)?._count._all ?? 0;

  const paid = countFor(InvoiceStatus.PAID);

  return {
    rows,
    total,
    counts: {
      // Anything with a balance still to settle counts as unpaid on the screen.
      unpaid:
        countFor(InvoiceStatus.DRAFT) +
        countFor(InvoiceStatus.ISSUED) +
        countFor(InvoiceStatus.PARTIALLY_PAID) +
        countFor(InvoiceStatus.OVERDUE),
      paid,
      totalAmount: outstanding._sum.totalAmount ?? D(0),
      paidAmount: outstanding._sum.paidAmount ?? D(0),
      balanceAmount: outstanding._sum.balanceAmount ?? D(0),
    },
  };
}

export async function getInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: invoiceDetailInclude });

  if (!invoice) {
    throw new NotFoundError('Invoice', id);
  }

  return invoice;
}

/** Screen 13 needs both streams of one order side by side. */
export async function getOrderBilling(salesOrderId: string) {
  const order = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: { id: true, number: true, status: true, totalAmount: true },
  });

  if (!order) {
    throw new NotFoundError('Sales order', salesOrderId);
  }

  const [oneTime, recurring, subscriptions] = await Promise.all([
    prisma.invoice.findMany({
      where: { salesOrderId, type: InvoiceType.ONE_TIME },
      orderBy: { createdAt: 'asc' },
      include: { lines: true },
    }),
    prisma.invoice.findMany({
      where: { salesOrderId, type: InvoiceType.RECURRING },
      orderBy: { createdAt: 'asc' },
      include: { lines: true },
    }),
    prisma.subscription.findMany({
      where: { salesOrderId },
      include: { subscriptionPlan: { select: { code: true, name: true } } },
    }),
  ]);

  return { salesOrder: order, oneTimeInvoices: oneTime, recurringInvoices: recurring, subscriptions };
}

// ---------------------------------------------------------------------------
// One-time invoicing — driven by what shipped
// ---------------------------------------------------------------------------

/** Totals an invoice from its lines and writes the money columns. */
async function totaliseInvoice(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
  const lines = await tx.invoiceLine.findMany({ where: { invoiceId } });
  const subtotal = lines.reduce((sum, line) => sum.plus(line.lineTotal), D(0)).toDecimalPlaces(2);
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotalAmount: subtotal,
      totalAmount: subtotal.plus(invoice.taxAmount).toDecimalPlaces(2),
      balanceAmount: subtotal.plus(invoice.taxAmount).minus(invoice.paidAmount).toDecimalPlaces(2),
    },
  });
}

/**
 * Bills the quantities a set of shipments actually carried.
 *
 * Called from the fulfillment ship step, inside the same transaction, so an
 * invoice can never exist for stock that has not left a warehouse.
 */
export async function invoiceShippedFulfillments(
  tx: Prisma.TransactionClient,
  salesOrderId: string,
  fulfillmentIds: string[],
  actorUserId: string,
): Promise<string | null> {
  if (fulfillmentIds.length === 0) {
    return null;
  }

  const order = await tx.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: { lines: { include: { product: { select: { name: true } } } } },
  });
  if (!order) {
    throw new NotFoundError('Sales order', salesOrderId);
  }

  const fulfillments = await tx.fulfillment.findMany({ where: { id: { in: fulfillmentIds } } });
  const lineById = new Map(order.lines.map((line) => [line.id, line]));

  interface ShippedLine {
    salesOrderLineId: string;
    fulfillmentId: string;
    quantity: Prisma.Decimal;
  }

  const shipped: ShippedLine[] = [];
  for (const fulfillment of fulfillments) {
    const entries = fulfillment.lines as unknown as Array<{ salesOrderLineId: string; quantity: string }>;
    for (const entry of entries) {
      shipped.push({
        salesOrderLineId: entry.salesOrderLineId,
        fulfillmentId: fulfillment.id,
        quantity: D(entry.quantity),
      });
    }
  }

  if (shipped.length === 0) {
    return null;
  }

  const issueDate = new Date();
  const invoice = await tx.invoice.create({
    data: {
      number: await nextInvoiceNumber(tx),
      customerId: order.customerId,
      salesOrderId: order.id,
      type: InvoiceType.ONE_TIME,
      status: InvoiceStatus.ISSUED,
      issueDate,
      dueDate: addDays(issueDate, PAYMENT_TERM_DAYS),
      notes: 'Billed against shipped quantities only',
    },
  });

  for (const entry of shipped) {
    const line = lineById.get(entry.salesOrderLineId);
    if (!line) {
      throw new ConflictError(`Shipment references line ${entry.salesOrderLineId}, which is not on this order`);
    }

    const lineTotal = line.unitPrice
      .mul(entry.quantity)
      .mul(D(100).minus(line.discountPct))
      .div(100)
      .toDecimalPlaces(2);

    await tx.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        salesOrderLineId: line.id,
        fulfillmentId: entry.fulfillmentId,
        description: line.product.name,
        quantity: entry.quantity,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        lineTotal,
      },
    });
  }

  await totaliseInvoice(tx, invoice.id);

  await tx.billingSchedule.create({
    data: {
      salesOrderId: order.id,
      invoiceId: invoice.id,
      invoiceType: InvoiceType.ONE_TIME,
      status: BillingScheduleStatus.INVOICED,
      periodStart: issueDate,
      periodEnd: issueDate,
      dueDate: addDays(issueDate, PAYMENT_TERM_DAYS),
      amount: (await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).totalAmount,
    },
  });

  await recordAudit(tx, {
    entityType: 'invoice',
    entityId: invoice.id,
    action: AuditAction.CREATE,
    userId: actorUserId,
    reason: 'One-time invoice raised for shipped quantities',
    changes: { salesOrderId, fulfillmentIds, lineCount: shipped.length },
  });

  return invoice.id;
}

// ---------------------------------------------------------------------------
// Recurring invoicing — the demo trigger
// ---------------------------------------------------------------------------

/**
 * Invoices the subscription's open billing period and schedules the next one.
 *
 * This is the manual advance the demo drives: there is no cron, so a click here
 * stands in for the cycle rolling over.
 */
export async function generateRecurringInvoice(subscriptionId: string, actorUserId: string) {
  const invoiceId = await prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { id: subscriptionId },
      include: { subscriptionPlan: { select: { code: true, name: true } } },
    });
    if (!subscription) {
      throw new NotFoundError('Subscription', subscriptionId);
    }
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new ConflictError(`Subscription is ${subscription.status} and does not bill`);
    }

    const schedule = await tx.billingSchedule.findFirst({
      where: {
        subscriptionId,
        invoiceType: InvoiceType.RECURRING,
        status: BillingScheduleStatus.SCHEDULED,
      },
      orderBy: { periodStart: 'asc' },
    });
    if (!schedule) {
      throw new ConflictError('No billing period is scheduled for this subscription');
    }

    const issueDate = new Date();
    const invoice = await tx.invoice.create({
      data: {
        number: await nextInvoiceNumber(tx),
        customerId: subscription.customerId,
        salesOrderId: subscription.salesOrderId,
        subscriptionId,
        type: InvoiceType.RECURRING,
        status: InvoiceStatus.ISSUED,
        issueDate,
        dueDate: schedule.dueDate,
        periodStart: schedule.periodStart,
        periodEnd: schedule.periodEnd,
      },
    });

    await tx.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        description: `${subscription.subscriptionPlan.name} — ${subscription.billingCycle.toLowerCase()} subscription`,
        quantity: subscription.quantity,
        unitPrice: subscription.unitPrice,
        lineTotal: subscription.recurringAmount,
        periodStart: schedule.periodStart,
        periodEnd: schedule.periodEnd,
      },
    });

    await totaliseInvoice(tx, invoice.id);

    await tx.billingSchedule.update({
      where: { id: schedule.id },
      data: { status: BillingScheduleStatus.INVOICED, invoiceId: invoice.id },
    });

    // The cycle advances: the next period is scheduled and the subscription's
    // next billing date moves with it.
    const nextPeriodStart = schedule.periodEnd;
    const nextPeriodEnd = addCycle(nextPeriodStart, subscription.billingCycle);

    await tx.billingSchedule.create({
      data: {
        subscriptionId,
        salesOrderId: subscription.salesOrderId,
        invoiceType: InvoiceType.RECURRING,
        status: BillingScheduleStatus.SCHEDULED,
        periodStart: nextPeriodStart,
        periodEnd: nextPeriodEnd,
        dueDate: addDays(nextPeriodEnd, PAYMENT_TERM_DAYS),
        amount: subscription.recurringAmount,
      },
    });

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { nextBillingDate: nextPeriodEnd },
    });

    await recordAudit(tx, {
      entityType: 'invoice',
      entityId: invoice.id,
      action: AuditAction.CREATE,
      userId: actorUserId,
      reason: `Recurring invoice for ${schedule.periodStart.toISOString().slice(0, 10)} → ${schedule.periodEnd.toISOString().slice(0, 10)}`,
      changes: { subscriptionId, billingScheduleId: schedule.id, amount: subscription.recurringAmount.toString() },
    });

    return invoice.id;
  });

  return getInvoice(invoiceId);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface RecordPaymentInput {
  actorUserId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
}

/** Records a payment and moves the invoice to PARTIALLY_PAID or PAID. */
export async function recordPayment(invoiceId: string, input: RecordPaymentInput) {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }
    if (invoice.status === InvoiceStatus.VOID) {
      throw new ConflictError('A void invoice cannot take a payment');
    }

    const amount = D(input.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new ValidationError('A payment must be greater than zero');
    }
    if (amount.greaterThan(invoice.balanceAmount)) {
      throw new ValidationError(
        `Payment of ${amount.toString()} is more than the ${invoice.balanceAmount.toString()} still outstanding`,
      );
    }

    const payment = await tx.payment.create({
      data: {
        invoiceId,
        customerId: invoice.customerId,
        method: input.method,
        status: PaymentStatus.COMPLETED,
        amount,
        reference: input.reference ?? null,
        paidAt: new Date(),
        recordedByUserId: input.actorUserId,
      },
    });

    const paidAmount = invoice.paidAmount.plus(amount).toDecimalPlaces(2);
    const balanceAmount = invoice.totalAmount.minus(paidAmount).toDecimalPlaces(2);

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount,
        balanceAmount,
        status: balanceAmount.lessThanOrEqualTo(0) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
      },
    });

    await recordAudit(tx, {
      entityType: 'invoice',
      entityId: invoiceId,
      action: AuditAction.UPDATE,
      userId: input.actorUserId,
      reason: `Payment of ${amount.toString()} recorded`,
      changes: { paymentId: payment.id, method: input.method, paidAmount: paidAmount.toString(), balanceAmount: balanceAmount.toString() },
    });
  });

  return getInvoice(invoiceId);
}

/** Fulfillment statuses that count as shipped for reconciliation. */
export const SHIPPED_STATUSES: FulfillmentStatus[] = [
  FulfillmentStatus.SHIPPED,
  FulfillmentStatus.DELIVERED,
];
