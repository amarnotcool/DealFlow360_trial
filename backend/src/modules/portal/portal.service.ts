// Customer-facing quotation surface (specs.md §4 portal negotiation, §7 step 7).
//
// Two rules shape everything here:
//
// 1. Scope. Every read and write is filtered by the customer on the portal
//    session. A quotation belonging to somebody else is reported as missing —
//    the portal never confirms that another customer's quote exists.
// 2. Reuse. The counter discounts a customer proposes are priced by the same
//    discount engine an internal edit goes through, and route through the same
//    approval chain builder. Nothing about risk is recomputed here.

import {
  AuditAction,
  NegotiationStatus,
  Prisma,
  QuotationStatus,
} from '@prisma/client';
import type { PortalNegotiationInput } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import {
  confirmQuotation,
  rebuildApprovalChain,
  recomputeQuotation,
} from '../quotations/quotations.service';
import type { PortalSession } from '../../middleware/portal-auth';

/** The stages a customer is meant to see. A draft is never shared. */
const PORTAL_VISIBLE_STATUSES = [
  QuotationStatus.APPROVED,
  QuotationStatus.NEGOTIATION,
  QuotationStatus.PENDING_APPROVAL,
  QuotationStatus.CONFIRMED,
] as const;

/** The stages a customer can still act on. */
const PORTAL_ACTIONABLE_STATUSES: QuotationStatus[] = [
  QuotationStatus.APPROVED,
  QuotationStatus.NEGOTIATION,
];

const portalDetailSelect = {
  id: true,
  number: true,
  status: true,
  notes: true,
  subtotalAmount: true,
  discountAmount: true,
  oneTimeTotalAmount: true,
  recurringTotalAmount: true,
  totalAmount: true,
  validUntil: true,
  createdAt: true,
  lastActivityAt: true,
  customer: { select: { id: true, name: true } },
  // Deliberately no risk score, ceilings, overage or approval chain: those are
  // internal policy, not the customer's business.
  lines: {
    orderBy: { sequence: 'asc' },
    select: {
      id: true,
      sequence: true,
      lineType: true,
      description: true,
      quantity: true,
      unitPrice: true,
      discountPct: true,
      lineTotal: true,
      product: { select: { id: true, sku: true, name: true } },
    },
  },
  negotiationRequests: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      quotationLineId: true,
      status: true,
      comment: true,
      counterDiscountPct: true,
      responseNote: true,
      respondedAt: true,
      createdAt: true,
    },
  },
  _count: { select: { lines: true, negotiationRequests: true } },
} satisfies Prisma.QuotationSelect;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listQuotations(session: PortalSession) {
  const where: Prisma.QuotationWhereInput = {
    customerId: session.customerId,
    status: { in: [...PORTAL_VISIBLE_STATUSES] },
  };

  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        oneTimeTotalAmount: true,
        recurringTotalAmount: true,
        totalAmount: true,
        validUntil: true,
        createdAt: true,
        lastActivityAt: true,
        _count: { select: { lines: true, negotiationRequests: true } },
      },
    }),
    prisma.quotation.count({ where }),
  ]);

  return { rows, total };
}

/**
 * One quotation, scoped to the session's customer. A quote that belongs to
 * another customer, or that is not in a stage the portal shows, is reported as
 * not found — the same answer as an id that does not exist.
 */
export async function getQuotation(quotationId: string, session: PortalSession) {
  const quotation = await prisma.quotation.findFirst({
    where: {
      id: quotationId,
      customerId: session.customerId,
      status: { in: [...PORTAL_VISIBLE_STATUSES] },
    },
    select: portalDetailSelect,
  });

  if (!quotation) {
    throw new NotFoundError('Quotation', quotationId);
  }

  return quotation;
}

/** Loads a quote the customer is allowed to act on, or explains why they cannot. */
async function loadActionable(quotationId: string, session: PortalSession) {
  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, customerId: session.customerId },
    select: { id: true, number: true, status: true, ownerUserId: true },
  });

  if (!quotation || !([...PORTAL_VISIBLE_STATUSES] as QuotationStatus[]).includes(quotation.status)) {
    throw new NotFoundError('Quotation', quotationId);
  }
  if (!PORTAL_ACTIONABLE_STATUSES.includes(quotation.status)) {
    throw new ConflictError(
      `Quotation ${quotation.number} is ${quotation.status} and is not open for changes`,
    );
  }

  return quotation;
}

// ---------------------------------------------------------------------------
// Negotiate — comments and counter discounts
// ---------------------------------------------------------------------------

export async function negotiate(
  quotationId: string,
  session: PortalSession,
  items: PortalNegotiationInput[],
) {
  await prisma.$transaction(async (tx) => {
    const quotation = await loadActionable(quotationId, session);

    const lineIds = new Set(
      (await tx.quotationLine.findMany({ where: { quotationId }, select: { id: true } })).map(
        (line) => line.id,
      ),
    );

    for (const item of items) {
      if (item.quotationLineId && !lineIds.has(item.quotationLineId)) {
        throw new ValidationError(
          `Line ${item.quotationLineId} is not on quotation ${quotation.number}`,
        );
      }

      await tx.negotiationRequest.create({
        data: {
          quotationId,
          quotationLineId: item.quotationLineId ?? null,
          customerContactId: session.contactId,
          status: NegotiationStatus.PENDING,
          comment: item.comment ?? null,
          counterDiscountPct:
            item.counterDiscountPct == null ? null : new Prisma.Decimal(item.counterDiscountPct),
        },
      });
    }

    // The quote is now under discussion; the rep sees it in the Negotiation
    // stage until the customer confirms.
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: QuotationStatus.NEGOTIATION, lastActivityAt: new Date() },
    });

    await recordAudit(tx, {
      entityType: 'quotation',
      entityId: quotationId,
      action: AuditAction.UPDATE,
      // The actor is a customer contact, not a staff user, so user_id stays
      // null and the contact is named in the entry itself.
      userId: null,
      reason: `Customer negotiation — ${items.length} request(s) from portal contact ${session.contactId}`,
      changes: {
        portalContactId: session.contactId,
        customerId: session.customerId,
        requests: items.map((item) => ({
          quotationLineId: item.quotationLineId ?? null,
          counterDiscountPct: item.counterDiscountPct ?? null,
          hasComment: Boolean(item.comment),
        })),
      },
    });
  });

  return getQuotation(quotationId, session);
}

// ---------------------------------------------------------------------------
// Confirm — specs.md §4: over a ceiling it re-enters approval, otherwise it
// moves straight to fulfillment
// ---------------------------------------------------------------------------

export interface PortalConfirmSummary {
  outcome: 'RE_APPROVAL' | 'CONFIRMED';
  salesOrder: { id: string; number: string } | null;
  approvalChain: string[];
  appliedCounters: Array<{ quotationLineId: string; discountPct: string }>;
}

export async function confirm(
  quotationId: string,
  session: PortalSession,
): Promise<PortalConfirmSummary> {
  const decision = await prisma.$transaction(async (tx) => {
    const quotation = await loadActionable(quotationId, session);

    // Counters are applied oldest first, so a customer who revised their offer
    // ends up with the discount they asked for last.
    const pending = await tx.negotiationRequest.findMany({
      where: {
        quotationId,
        status: NegotiationStatus.PENDING,
        counterDiscountPct: { not: null },
        quotationLineId: { not: null },
      },
      orderBy: { createdAt: 'asc' },
    });

    const applied = new Map<string, Prisma.Decimal>();

    for (const request of pending) {
      const lineId = request.quotationLineId as string;
      const counter = request.counterDiscountPct as Prisma.Decimal;

      await tx.quotationLine.update({ where: { id: lineId }, data: { discountPct: counter } });
      applied.set(lineId, counter);
    }

    if (applied.size > 0) {
      await recordAudit(tx, {
        entityType: 'quotation',
        entityId: quotationId,
        action: AuditAction.DISCOUNT_EDIT,
        userId: null,
        reason: `Customer negotiation — ${applied.size} counter discount(s) applied on portal confirm`,
        changes: {
          portalContactId: session.contactId,
          counters: [...applied.entries()].map(([lineId, pct]) => ({
            quotationLineId: lineId,
            discountPct: pct.toString(),
          })),
        },
      });
    }

    // The same engine an internal discount edit runs through, on the same
    // stored ceilings — the portal never prices risk itself.
    const risk = await recomputeQuotation(tx, quotationId);

    for (const request of pending) {
      await tx.negotiationRequest.update({
        where: { id: request.id },
        data: { status: NegotiationStatus.ACCEPTED, respondedAt: new Date() },
      });
    }

    const appliedCounters = [...applied.entries()].map(([quotationLineId, pct]) => ({
      quotationLineId,
      discountPct: pct.toString(),
    }));

    if (risk.requiredApprovalChain.length > 0) {
      // The agreed terms are over a ceiling: the quote goes back into approval
      // on its own — nobody clicked "request approval".
      const chain = await rebuildApprovalChain(tx, quotationId, risk);

      await tx.quotation.update({
        where: { id: quotationId },
        data: {
          status: QuotationStatus.PENDING_APPROVAL,
          requiresApproval: true,
          submittedAt: new Date(),
          approvedAt: null,
          lastActivityAt: new Date(),
        },
      });

      await recordAudit(tx, {
        entityType: 'quotation',
        entityId: quotationId,
        action: AuditAction.UPDATE,
        userId: null,
        reason: `Customer confirmed negotiated terms — re-entered approval at ${risk.riskLevel} risk`,
        changes: {
          portalContactId: session.contactId,
          blendedScore: risk.blendedScore,
          riskLevel: risk.riskLevel,
          chain,
        },
      });

      return {
        outcome: 'RE_APPROVAL' as const,
        chain: chain.map((level) => String(level)),
        appliedCounters,
        ownerUserId: quotation.ownerUserId,
      };
    }

    // Within every ceiling: the terms stand as approved, and the confirm below
    // turns them into an order.
    await tx.quotation.update({
      where: { id: quotationId },
      data: {
        status: QuotationStatus.APPROVED,
        requiresApproval: false,
        approvedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    await tx.approvalStep.deleteMany({ where: { quotationId } });

    await recordAudit(tx, {
      entityType: 'quotation',
      entityId: quotationId,
      action: AuditAction.UPDATE,
      userId: null,
      reason: 'Customer confirmed terms within every ceiling — no approval needed',
      changes: {
        portalContactId: session.contactId,
        blendedScore: risk.blendedScore,
        riskLevel: risk.riskLevel,
      },
    });

    return {
      outcome: 'CONFIRMED' as const,
      chain: [] as string[],
      appliedCounters,
      ownerUserId: quotation.ownerUserId,
    };
  });

  if (decision.outcome === 'RE_APPROVAL') {
    return {
      outcome: 'RE_APPROVAL',
      salesOrder: null,
      approvalChain: decision.chain,
      appliedCounters: decision.appliedCounters,
    };
  }

  // Order creation is the internal confirm, unchanged: one implementation, so a
  // portal-confirmed order is identical to a rep-confirmed one. The staff actor
  // recorded on it is the account owner; the audit entry above names the
  // customer contact who asked for it.
  const salesOrder = await confirmQuotation(quotationId, decision.ownerUserId);

  return {
    outcome: 'CONFIRMED',
    salesOrder: { id: salesOrder.id, number: salesOrder.number },
    approvalChain: [],
    appliedCounters: decision.appliedCounters,
  };
}
