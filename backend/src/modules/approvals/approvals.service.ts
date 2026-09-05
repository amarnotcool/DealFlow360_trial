// Approval decisions. The chain itself was built by the quotations module from
// the discount engine's result; this module only walks it.

import { ApprovalLevel, ApprovalStepStatus, AuditAction, Prisma, QuotationStatus } from '@prisma/client';
import type { RoleCode } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import { getQuotation } from '../quotations/quotations.service';

/** Statuses that put a quotation on an approver's desk or in their history. */
const APPROVAL_QUEUE_STATUSES = [
  QuotationStatus.PENDING_APPROVAL,
  QuotationStatus.APPROVED,
  QuotationStatus.REJECTED,
] as const;

export async function listApprovals(params: { skip: number; take: number }) {
  const where: Prisma.QuotationWhereInput = {
    OR: [
      { status: { in: [...APPROVAL_QUEUE_STATUSES] } },
      { approvalSteps: { some: { status: ApprovalStepStatus.RETURNED } } },
    ],
  };

  const [rows, total, pending, returned, approved] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy: [{ riskScore: 'desc' }, { submittedAt: 'desc' }],
      skip: params.skip,
      take: params.take,
      include: {
        customer: { select: { id: true, name: true } },
        ownerUser: { select: { id: true, fullName: true } },
        approvalSteps: {
          orderBy: { sequence: 'asc' },
          include: { assigneeUser: { select: { id: true, fullName: true } } },
        },
      },
    }),
    prisma.quotation.count({ where }),
    prisma.quotation.count({ where: { status: QuotationStatus.PENDING_APPROVAL } }),
    prisma.approvalStep.count({ where: { status: ApprovalStepStatus.RETURNED } }),
    prisma.quotation.count({ where: { status: QuotationStatus.APPROVED } }),
  ]);

  // The desk view wants the badge fields flat, plus who the ball is with.
  const data = rows.map((quotation) => {
    const currentStep = quotation.approvalSteps.find((step) => step.status === ApprovalStepStatus.PENDING);

    return {
      id: quotation.id,
      number: quotation.number,
      status: quotation.status,
      customer: quotation.customer,
      owner: quotation.ownerUser,
      riskScore: quotation.riskScore,
      riskLevel: quotation.riskLevel,
      maxSingleOveragePct: quotation.maxSingleOveragePct,
      totalOveragePct: quotation.totalOveragePct,
      totalAmount: quotation.totalAmount,
      submittedAt: quotation.submittedAt,
      currentStep: currentStep
        ? {
            id: currentStep.id,
            level: currentStep.level,
            sequence: currentStep.sequence,
            assignee: currentStep.assigneeUser,
          }
        : null,
      steps: quotation.approvalSteps.map((step) => ({
        id: step.id,
        level: step.level,
        sequence: step.sequence,
        status: step.status,
        decidedAt: step.decidedAt,
      })),
    };
  });

  return { data, total, counts: { pending, returned, approved } };
}

/** Detail keyed by quotation id: why each line was flagged, plus the timeline. */
export async function getApprovalDetail(quotationId: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      customer: { select: { id: true, name: true, customerTier: { select: { code: true, name: true } } } },
      ownerUser: { select: { id: true, fullName: true } },
      lines: {
        orderBy: { sequence: 'asc' },
        include: { product: { select: { name: true } }, category: { select: { code: true, name: true } } },
      },
      riskScoreFactors: true,
      approvalSteps: {
        orderBy: { sequence: 'asc' },
        include: {
          assigneeUser: { select: { id: true, fullName: true } },
          decidedByUser: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  if (!quotation) {
    throw new NotFoundError('Quotation', quotationId);
  }

  const factorByLineId = new Map(quotation.riskScoreFactors.map((factor) => [factor.quotationLineId, factor]));

  const breakdown = quotation.lines.map((line) => {
    const factor = factorByLineId.get(line.id);

    return {
      lineId: line.id,
      product: line.product.name,
      category: line.category,
      quantity: line.quantity,
      discountPct: line.discountPct,
      tierCeilingPct: factor?.tierCeilingPct ?? null,
      categoryCeilingPct: factor?.categoryCeilingPct ?? null,
      applicableCeilingPct: factor?.applicableCeilingPct ?? line.applicableCeilingPct,
      overagePct: factor?.overagePct ?? line.overagePct,
      weight: factor?.weight ?? null,
      contribution: factor?.contribution ?? null,
      flagged: (factor?.overagePct ?? line.overagePct).greaterThan(0),
    };
  });

  return {
    id: quotation.id,
    number: quotation.number,
    status: quotation.status,
    customer: quotation.customer,
    owner: quotation.ownerUser,
    riskScore: quotation.riskScore,
    riskLevel: quotation.riskLevel,
    maxSingleOveragePct: quotation.maxSingleOveragePct,
    totalOveragePct: quotation.totalOveragePct,
    totalAmount: quotation.totalAmount,
    breakdown,
    timeline: quotation.approvalSteps,
  };
}

/** Loads the quotation and the step the decision applies to. */
async function loadPendingStep(tx: Prisma.TransactionClient, quotationId: string) {
  const quotation = await tx.quotation.findUnique({
    where: { id: quotationId },
    include: { approvalSteps: { orderBy: { sequence: 'asc' } } },
  });

  if (!quotation) {
    throw new NotFoundError('Quotation', quotationId);
  }
  if (quotation.status !== QuotationStatus.PENDING_APPROVAL) {
    throw new ConflictError(`Quotation in status ${quotation.status} has no pending approval`);
  }

  const step = quotation.approvalSteps.find((candidate) => candidate.status === ApprovalStepStatus.PENDING);
  if (!step) {
    throw new ConflictError('Quotation has no pending approval step');
  }

  return { quotation, step };
}

export interface DecisionInput {
  actorUserId: string;
  /** The role the deciding session carries, checked against the step's level. */
  actorRole: RoleCode;
  reason?: string | null;
}

/** The role that a step of each level is waiting on. */
const LEVEL_ROLE: Record<ApprovalLevel, RoleCode> = {
  [ApprovalLevel.SALES_MANAGER]: 'SALES_MANAGER',
  [ApprovalLevel.FINANCE]: 'FINANCE',
};

/**
 * A step belongs to one level of the chain, so only that level decides it: a
 * manager cannot sign off the finance step of a high-risk quote, and finance
 * cannot stand in for the manager step ahead of it.
 */
function assertCanDecide(level: ApprovalLevel, actorRole: RoleCode): void {
  if (LEVEL_ROLE[level] !== actorRole) {
    throw new ForbiddenError(
      `This step needs ${LEVEL_ROLE[level]} — ${actorRole} cannot decide it`,
    );
  }
}

export async function approve(quotationId: string, input: DecisionInput) {
  await prisma.$transaction(async (tx) => {
    const { quotation, step } = await loadPendingStep(tx, quotationId);
    assertCanDecide(step.level, input.actorRole);

    await tx.approvalStep.update({
      where: { id: step.id },
      data: {
        status: ApprovalStepStatus.APPROVED,
        decidedByUserId: input.actorUserId,
        decidedAt: new Date(),
        reason: input.reason ?? null,
      },
    });

    // Only the last step in the chain flips the quotation to APPROVED; a
    // Manager approval on a two-step chain leaves it with Finance.
    const isLastStep = !quotation.approvalSteps.some(
      (candidate) => candidate.sequence > step.sequence && candidate.status === ApprovalStepStatus.PENDING,
    );

    if (isLastStep) {
      await tx.quotation.update({
        where: { id: quotationId },
        data: { status: QuotationStatus.APPROVED, approvedAt: new Date(), lastActivityAt: new Date() },
      });
    } else {
      await tx.quotation.update({ where: { id: quotationId }, data: { lastActivityAt: new Date() } });
    }

    await recordAudit(tx, {
      entityType: 'approval_step',
      entityId: step.id,
      action: AuditAction.APPROVE,
      userId: input.actorUserId,
      reason: input.reason ?? null,
      changes: { quotationId, level: step.level, sequence: step.sequence, quotationApproved: isLastStep },
    });
  });

  return getQuotation(quotationId);
}

export async function reject(quotationId: string, input: DecisionInput) {
  await prisma.$transaction(async (tx) => {
    const { step } = await loadPendingStep(tx, quotationId);
    assertCanDecide(step.level, input.actorRole);

    await tx.approvalStep.update({
      where: { id: step.id },
      data: {
        status: ApprovalStepStatus.REJECTED,
        decidedByUserId: input.actorUserId,
        decidedAt: new Date(),
        reason: input.reason ?? null,
      },
    });

    // A rejection ends the chain, so later steps never get their turn.
    await tx.approvalStep.updateMany({
      where: { quotationId, status: ApprovalStepStatus.PENDING },
      data: { status: ApprovalStepStatus.REJECTED },
    });

    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: QuotationStatus.REJECTED, lastActivityAt: new Date() },
    });

    await recordAudit(tx, {
      entityType: 'approval_step',
      entityId: step.id,
      action: AuditAction.REJECT,
      userId: input.actorUserId,
      reason: input.reason ?? null,
      changes: { quotationId, level: step.level, sequence: step.sequence },
    });
  });

  return getQuotation(quotationId);
}

/** Sends the quote back to the rep for revision; the chain is rebuilt on resubmit. */
export async function returnForRevision(quotationId: string, input: DecisionInput) {
  await prisma.$transaction(async (tx) => {
    const { step } = await loadPendingStep(tx, quotationId);
    assertCanDecide(step.level, input.actorRole);

    await tx.approvalStep.update({
      where: { id: step.id },
      data: {
        status: ApprovalStepStatus.RETURNED,
        decidedByUserId: input.actorUserId,
        decidedAt: new Date(),
        reason: input.reason ?? null,
      },
    });

    // Later steps never got their turn either; the chain is rebuilt on resubmit.
    await tx.approvalStep.updateMany({
      where: { quotationId, status: ApprovalStepStatus.PENDING },
      data: { status: ApprovalStepStatus.RETURNED },
    });

    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: QuotationStatus.DRAFT, submittedAt: null, lastActivityAt: new Date() },
    });

    await recordAudit(tx, {
      entityType: 'approval_step',
      entityId: step.id,
      action: AuditAction.RETURN,
      userId: input.actorUserId,
      reason: input.reason ?? null,
      changes: { quotationId, level: step.level, sequence: step.sequence },
    });
  });

  return getQuotation(quotationId);
}
