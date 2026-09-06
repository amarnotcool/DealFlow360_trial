// The internal side of portal negotiation (specs.md §2: the Sales Rep
// "respond to negotiation requests").
//
// The customer raises requests from the portal (portal.service.ts); this is
// where staff read them and answer. Answering is not a note on the side:
//
//   ACCEPT  the counter is priced straight onto the line and the discount
//           engine is rerun, so the agreed rate is the quote's real rate. If
//           that breaks a ceiling the quotation re-enters the approval chain by
//           itself — the same thing a portal confirm does, so agreeing on the
//           phone can never bypass governance.
//   REJECT  the line is left alone. Because portal confirm only applies
//           requests that are still PENDING, a rejected counter can never come
//           back through the customer's own confirm.
//
// Both paths write respondedByUserId, respondedAt and responseNote — the
// columns the schema has always carried and nothing used to fill.
//
// WITHDRAWN is left alone deliberately: nothing in the product lets a customer
// take a request back, and inventing a status transition no screen can reach
// would be dead code.

import {
  AuditAction,
  NegotiationStatus,
  Prisma,
  QuotationStatus,
} from '@prisma/client';
import type {
  NegotiationListMeta,
  NegotiationRequestView,
  NegotiationRespondResult,
  NegotiationStatus as NegotiationStatusView,
} from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import { rebuildApprovalChain, recomputeQuotation } from '../quotations/quotations.service';
import type { RespondBody } from './negotiation.schemas';

/**
 * A request can only be answered once. ACCEPTED and REJECTED are both final,
 * and WITHDRAWN is not a state this module can produce or answer.
 */
const ANSWERABLE: NegotiationStatus[] = [NegotiationStatus.PENDING];

/**
 * The stages a quotation can still be negotiated in. A DRAFT has not been
 * shared, and a CONFIRMED order is past discussion — the portal enforces the
 * same window on its side.
 */
const NEGOTIABLE_STATUSES: QuotationStatus[] = [
  QuotationStatus.APPROVED,
  QuotationStatus.NEGOTIATION,
  QuotationStatus.PENDING_APPROVAL,
];

const requestInclude = {
  quotationLine: {
    select: {
      id: true,
      sequence: true,
      description: true,
      discountPct: true,
      product: { select: { id: true, sku: true, name: true } },
    },
  },
  customerContact: { select: { id: true, fullName: true, email: true } },
  respondedByUser: { select: { id: true, fullName: true } },
} satisfies Prisma.NegotiationRequestInclude;

type RequestRow = Prisma.NegotiationRequestGetPayload<{ include: typeof requestInclude }>;

function toView(row: RequestRow): NegotiationRequestView {
  return {
    id: row.id,
    quotationId: row.quotationId,
    status: row.status as NegotiationStatusView,
    comment: row.comment,
    counterDiscountPct: row.counterDiscountPct === null ? null : row.counterDiscountPct.toFixed(2),
    requestedDeliveryDate: row.requestedDeliveryDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    line: row.quotationLine
      ? {
          id: row.quotationLine.id,
          sequence: row.quotationLine.sequence,
          description: row.quotationLine.description,
          product: row.quotationLine.product,
          discountPct: row.quotationLine.discountPct.toFixed(2),
        }
      : null,
    contact: row.customerContact,
    respondedBy: row.respondedByUser,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    responseNote: row.responseNote,
  };
}

function emptyByStatus(): Record<NegotiationStatusView, number> {
  return { PENDING: 0, ACCEPTED: 0, REJECTED: 0, WITHDRAWN: 0 } as Record<
    NegotiationStatusView,
    number
  >;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Everything the customer has asked for on one quotation, oldest first. */
export async function listForQuotation(
  quotationId: string,
): Promise<{ rows: NegotiationRequestView[]; meta: NegotiationListMeta }> {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true },
  });
  if (!quotation) {
    throw new NotFoundError('Quotation', quotationId);
  }

  const [rows, byStatus] = await Promise.all([
    prisma.negotiationRequest.findMany({
      where: { quotationId },
      include: requestInclude,
      // Oldest first: the thread reads as a conversation, and it is the order
      // portal confirm applies counters in.
      orderBy: { createdAt: 'asc' },
    }),
    prisma.negotiationRequest.groupBy({
      by: ['status'],
      where: { quotationId },
      _count: { _all: true },
    }),
  ]);

  const counts = emptyByStatus();
  for (const row of byStatus) counts[row.status as NegotiationStatusView] = row._count._all;

  return {
    rows: rows.map(toView),
    meta: { total: rows.length, byStatus: counts, pending: counts.PENDING },
  };
}

// ---------------------------------------------------------------------------
// Respond
// ---------------------------------------------------------------------------

export async function respond(
  requestId: string,
  actorUserId: string,
  body: RespondBody,
): Promise<NegotiationRespondResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    const request = await tx.negotiationRequest.findUnique({
      where: { id: requestId },
      include: { quotation: { select: { id: true, number: true, status: true } } },
    });

    if (!request) {
      throw new NotFoundError('Negotiation request', requestId);
    }
    if (!ANSWERABLE.includes(request.status)) {
      throw new ConflictError(
        `This request is already ${request.status} and cannot be answered again`,
      );
    }
    if (!NEGOTIABLE_STATUSES.includes(request.quotation.status)) {
      throw new ConflictError(
        `Quotation ${request.quotation.number} is ${request.quotation.status} and is no longer under negotiation`,
      );
    }

    const accepting = body.decision === 'ACCEPT';
    const note = body.responseNote?.trim() || null;

    // A counter is only priceable when it names a line and a percentage. A
    // comment or a delivery-date request is answered in words alone.
    const priceable =
      accepting && request.quotationLineId !== null && request.counterDiscountPct !== null;

    let appliedDiscountPct: string | null = null;

    if (priceable) {
      const lineId = request.quotationLineId as string;
      const counter = request.counterDiscountPct as Prisma.Decimal;

      await tx.quotationLine.update({ where: { id: lineId }, data: { discountPct: counter } });
      appliedDiscountPct = counter.toFixed(2);

      await recordAudit(tx, {
        entityType: 'quotation_line',
        entityId: lineId,
        action: AuditAction.DISCOUNT_EDIT,
        userId: actorUserId,
        reason: `Accepted the customer's counter of ${appliedDiscountPct}%`,
        changes: { negotiationRequestId: requestId, discountPct: appliedDiscountPct },
      });
    }

    await tx.negotiationRequest.update({
      where: { id: requestId },
      data: {
        status: accepting ? NegotiationStatus.ACCEPTED : NegotiationStatus.REJECTED,
        respondedByUserId: actorUserId,
        respondedAt: new Date(),
        responseNote: note,
      },
    });

    await recordAudit(tx, {
      entityType: 'negotiation_request',
      entityId: requestId,
      action: accepting ? AuditAction.APPROVE : AuditAction.REJECT,
      userId: actorUserId,
      reason:
        note ??
        (accepting
          ? 'Customer negotiation request accepted'
          : 'Customer negotiation request rejected'),
      changes: {
        quotationId: request.quotationId,
        quotationLineId: request.quotationLineId,
        counterDiscountPct: request.counterDiscountPct?.toFixed(2) ?? null,
        applied: priceable,
      },
    });

    // Repricing a line moves the blended score, so the engine runs again on the
    // stored ceilings — this module never prices risk itself.
    const risk = priceable ? await recomputeQuotation(tx, request.quotationId) : null;
    let approvalChain: string[] = [];
    let reEntered = false;

    if (risk && risk.requiredApprovalChain.length > 0) {
      // The rate staff agreed to is over a ceiling: the quote goes back into
      // the chain by itself, exactly as it would if the customer had confirmed
      // these terms from the portal. Accepting cannot approve a discount.
      const chain = await rebuildApprovalChain(tx, request.quotationId, risk);
      approvalChain = chain.map((level) => String(level));
      reEntered = true;

      await tx.quotation.update({
        where: { id: request.quotationId },
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
        entityId: request.quotationId,
        action: AuditAction.UPDATE,
        userId: actorUserId,
        reason: `Accepted counter is over a ceiling — re-entered approval at ${risk.riskLevel} risk`,
        changes: { blendedScore: risk.blendedScore, riskLevel: risk.riskLevel, chain: approvalChain },
      });
    } else {
      await tx.quotation.update({
        where: { id: request.quotationId },
        data: { lastActivityAt: new Date() },
      });
    }

    return {
      accepting,
      reEntered,
      approvalChain,
      appliedDiscountPct,
      quotationId: request.quotationId,
    };
  });

  const [row, quotation] = await Promise.all([
    prisma.negotiationRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: requestInclude,
    }),
    prisma.quotation.findUniqueOrThrow({
      where: { id: outcome.quotationId },
      select: {
        id: true,
        number: true,
        status: true,
        riskScore: true,
        riskLevel: true,
        requiresApproval: true,
      },
    }),
  ]);

  return {
    outcome: outcome.reEntered ? 'RE_APPROVAL' : outcome.accepting ? 'ACCEPTED' : 'REJECTED',
    request: toView(row),
    appliedDiscountPct: outcome.appliedDiscountPct,
    quotation: {
      id: quotation.id,
      number: quotation.number,
      status: quotation.status,
      riskScore: quotation.riskScore.toFixed(2),
      riskLevel: quotation.riskLevel,
      requiresApproval: quotation.requiresApproval,
    },
    approvalChain: outcome.approvalChain,
  };
}
