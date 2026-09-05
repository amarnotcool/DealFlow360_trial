// Quotation business logic and Prisma access.
//
// The blended risk maths is NOT repeated here: ceilings are read from the
// database, handed to the pure engine in discount-engine.service.ts, and its
// result is persisted. Nothing in this file recomputes an overage or a score.

import { Prisma, QuotationStatus, ApprovalStepStatus, ApprovalLevel, AuditAction, RiskLevel as PrismaRiskLevel, LineType } from '@prisma/client';
import type { DiscountEngineLineInput, DiscountEngineResult } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import { computeDiscountRisk } from '../discount-engine/discount-engine.service';

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const HUNDRED = D(100);

/** Weights the engine applies, mirrored here only to split the score per line. */
const TOTAL_TERM_WEIGHT = D('0.40');
const MAX_TERM_WEIGHT = D('0.60');

/** Role codes that staff an approval step of a given level. */
const LEVEL_ROLE_CODE: Record<ApprovalLevel, string> = {
  [ApprovalLevel.SALES_MANAGER]: 'SALES_MANAGER',
  [ApprovalLevel.FINANCE]: 'FINANCE',
};

const quotationDetailInclude = {
  customer: { include: { customerTier: true } },
  customerContact: true,
  ownerUser: { select: { id: true, fullName: true, email: true } },
  lines: {
    orderBy: { sequence: 'asc' },
    include: {
      product: { select: { id: true, sku: true, name: true } },
      productVariant: { select: { id: true, sku: true, name: true } },
      category: { select: { id: true, code: true, name: true } },
    },
  },
  riskScoreFactors: true,
  approvalSteps: {
    orderBy: { sequence: 'asc' },
    include: {
      assigneeUser: { select: { id: true, fullName: true } },
      decidedByUser: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.QuotationInclude;

export type QuotationDetail = Prisma.QuotationGetPayload<{ include: typeof quotationDetailInclude }>;

// ---------------------------------------------------------------------------
// Ceiling lookup — the only place the engine's inputs come from
// ---------------------------------------------------------------------------

interface Ceilings {
  tierCeilingPct: number;
  categoryCeilingPct: Map<string, number>;
  globalDefaultPct: number;
}

/**
 * Single-axis discount rules (Model B): a row is tier-only, category-only, or
 * the global default. A missing tier or category rule falls back to the global
 * default row.
 */
async function loadCeilings(
  tx: Prisma.TransactionClient,
  customerTierId: string,
  categoryIds: string[],
): Promise<Ceilings> {
  const rules = await tx.discountRule.findMany({
    where: {
      isActive: true,
      OR: [
        { customerTierId, categoryId: null },
        { categoryId: { in: categoryIds }, customerTierId: null },
        { customerTierId: null, categoryId: null },
      ],
    },
  });

  const globalRule = rules.find((rule) => rule.customerTierId === null && rule.categoryId === null);
  if (!globalRule) {
    throw new ConflictError('No global default discount_rule is configured');
  }
  const globalDefaultPct = globalRule.ceilingPct.toNumber();

  const tierRule = rules.find((rule) => rule.customerTierId === customerTierId);

  const categoryCeilingPct = new Map<string, number>();
  for (const categoryId of categoryIds) {
    const categoryRule = rules.find((rule) => rule.categoryId === categoryId);
    categoryCeilingPct.set(categoryId, categoryRule?.ceilingPct.toNumber() ?? globalDefaultPct);
  }

  return {
    tierCeilingPct: tierRule?.ceilingPct.toNumber() ?? globalDefaultPct,
    categoryCeilingPct,
    globalDefaultPct,
  };
}

// ---------------------------------------------------------------------------
// Recompute — run after every change that can move the score
// ---------------------------------------------------------------------------

/**
 * Prices the lines, runs the discount engine, and persists both: per-line
 * ceiling/overage, the quotation aggregates, and a fresh frozen snapshot in
 * risk_score_factor.
 */
export async function recomputeQuotation(
  tx: Prisma.TransactionClient,
  quotationId: string,
): Promise<DiscountEngineResult> {
  const quotation = await tx.quotation.findUnique({
    where: { id: quotationId },
    include: { customer: true, lines: { orderBy: { sequence: 'asc' } } },
  });

  if (!quotation) {
    throw new NotFoundError('Quotation', quotationId);
  }

  const categoryIds = [...new Set(quotation.lines.map((line) => line.categoryId))];
  const ceilings = await loadCeilings(tx, quotation.customer.customerTierId, categoryIds);

  const engineLines: DiscountEngineLineInput[] = quotation.lines.map((line) => ({
    lineId: line.id,
    categoryId: line.categoryId,
    tierCeilingPct: ceilings.tierCeilingPct,
    categoryCeilingPct: ceilings.categoryCeilingPct.get(line.categoryId) ?? ceilings.globalDefaultPct,
    discountPct: line.discountPct.toNumber(),
  }));

  const risk = computeDiscountRisk({ lines: engineLines });
  const resultByLineId = new Map(risk.lines.map((line) => [line.lineId, line]));

  // The line that drives max_single_overage also carries the 0.6 term; every
  // line carries 0.4 of its own overage. The contributions sum to the score.
  const maxDriverLineId =
    risk.maxSingleOverage > 0
      ? risk.lines.find((line) => line.overagePct === risk.maxSingleOverage)?.lineId
      : undefined;

  let subtotalAmount = D(0);
  let oneTimeTotalAmount = D(0);
  let recurringTotalAmount = D(0);
  let costAmount = D(0);

  await tx.riskScoreFactor.deleteMany({ where: { quotationId } });

  for (const line of quotation.lines) {
    const lineRisk = resultByLineId.get(line.id);
    if (!lineRisk) {
      throw new ConflictError(`Discount engine returned no result for line ${line.id}`);
    }

    const lineSubtotal = line.unitPrice.mul(line.quantity);
    const lineTotal = lineSubtotal.mul(HUNDRED.minus(line.discountPct)).div(HUNDRED).toDecimalPlaces(2);
    const lineCost = line.unitCost.mul(line.quantity);
    const marginAmount = lineTotal.minus(lineCost);
    const marginPct = lineTotal.isZero() ? D(0) : marginAmount.div(lineTotal).mul(HUNDRED).toDecimalPlaces(2);

    subtotalAmount = subtotalAmount.plus(lineSubtotal);
    costAmount = costAmount.plus(lineCost);
    if (line.lineType === LineType.RECURRING) {
      recurringTotalAmount = recurringTotalAmount.plus(lineTotal);
    } else {
      oneTimeTotalAmount = oneTimeTotalAmount.plus(lineTotal);
    }

    await tx.quotationLine.update({
      where: { id: line.id },
      data: {
        applicableCeilingPct: D(lineRisk.applicableCeilingPct),
        overagePct: D(lineRisk.overagePct),
        lineSubtotal: lineSubtotal.toDecimalPlaces(2),
        lineTotal,
        marginAmount: marginAmount.toDecimalPlaces(2),
        marginPct,
      },
    });

    const weight = line.id === maxDriverLineId ? TOTAL_TERM_WEIGHT.plus(MAX_TERM_WEIGHT) : TOTAL_TERM_WEIGHT;

    await tx.riskScoreFactor.create({
      data: {
        quotationId,
        quotationLineId: line.id,
        tierCeilingPct: D(ceilings.tierCeilingPct),
        categoryCeilingPct: D(ceilings.categoryCeilingPct.get(line.categoryId) ?? ceilings.globalDefaultPct),
        applicableCeilingPct: D(lineRisk.applicableCeilingPct),
        discountPct: line.discountPct,
        overagePct: D(lineRisk.overagePct),
        weight,
        contribution: weight.mul(D(lineRisk.overagePct)).toDecimalPlaces(2),
      },
    });
  }

  const totalAmount = oneTimeTotalAmount.plus(recurringTotalAmount).toDecimalPlaces(2);
  const marginAmount = totalAmount.minus(costAmount).toDecimalPlaces(2);

  await tx.quotation.update({
    where: { id: quotationId },
    data: {
      riskScore: D(risk.blendedScore),
      riskLevel: risk.riskLevel as PrismaRiskLevel,
      maxSingleOveragePct: D(risk.maxSingleOverage),
      totalOveragePct: D(risk.totalOverage),
      requiresApproval: risk.requiredApprovalChain.length > 0,
      subtotalAmount: subtotalAmount.toDecimalPlaces(2),
      discountAmount: subtotalAmount.minus(totalAmount).toDecimalPlaces(2),
      oneTimeTotalAmount: oneTimeTotalAmount.toDecimalPlaces(2),
      recurringTotalAmount: recurringTotalAmount.toDecimalPlaces(2),
      totalAmount,
      marginAmount,
      marginPct: totalAmount.isZero() ? D(0) : marginAmount.div(totalAmount).mul(HUNDRED).toDecimalPlaces(2),
      lastActivityAt: new Date(),
    },
  });

  return risk;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListQuotationsParams {
  status?: QuotationStatus;
  skip: number;
  take: number;
}

export async function listQuotations(params: ListQuotationsParams) {
  const where: Prisma.QuotationWhereInput = params.status ? { status: params.status } : {};

  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
      include: {
        customer: { select: { id: true, name: true, customerTier: { select: { code: true, name: true } } } },
        ownerUser: { select: { id: true, fullName: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.quotation.count({ where }),
  ]);

  return { rows, total };
}

export async function getQuotation(id: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: quotationDetailInclude,
  });

  if (!quotation) {
    throw new NotFoundError('Quotation', id);
  }

  // The breakdown is computed on read rather than trusted from the stored
  // columns, so a quote that has not been submitted yet (or was seeded) still
  // shows what the engine currently makes of it. Reads never write.
  const categoryIds = [...new Set(quotation.lines.map((line) => line.categoryId))];
  const ceilings = await loadCeilings(prisma, quotation.customer.customerTierId, categoryIds);

  const risk = computeDiscountRisk({
    lines: quotation.lines.map((line) => ({
      lineId: line.id,
      categoryId: line.categoryId,
      tierCeilingPct: ceilings.tierCeilingPct,
      categoryCeilingPct: ceilings.categoryCeilingPct.get(line.categoryId) ?? ceilings.globalDefaultPct,
      discountPct: line.discountPct.toNumber(),
    })),
  });

  return { ...quotation, risk };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface NewLineInput {
  productId: string;
  productVariantId?: string | null;
  subscriptionPlanId?: string | null;
  sourceRecommendationId?: string | null;
  lineType?: LineType;
  quantity: number;
  discountPct?: number;
  unitPrice?: number;
  description?: string | null;
}

export interface CreateQuotationInput {
  customerId: string;
  customerContactId?: string | null;
  ownerUserId: string;
  notes?: string | null;
  lines: NewLineInput[];
  actorUserId: string;
}

/** Generates the next Q-<year>-<counter> number. */
async function nextQuotationNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;
  const latest = await tx.quotation.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const lastCounter = latest ? Number.parseInt(latest.number.slice(prefix.length), 10) : 0;
  return `${prefix}${String(lastCounter + 1).padStart(4, '0')}`;
}

/** Resolves catalog price, cost and category for a line about to be written. */
async function resolveLineData(tx: Prisma.TransactionClient, input: NewLineInput, sequence: number) {
  const product = await tx.product.findUnique({ where: { id: input.productId } });
  if (!product) {
    throw new NotFoundError('Product', input.productId);
  }

  let extraPrice = D(0);
  if (input.productVariantId) {
    const variant = await tx.productVariant.findUnique({ where: { id: input.productVariantId } });
    if (!variant || variant.productId !== product.id) {
      throw new ValidationError(`Variant ${input.productVariantId} does not belong to product ${product.id}`);
    }
    extraPrice = variant.extraPrice;
  }

  const listPrice = product.listPrice.plus(extraPrice);

  return {
    productId: product.id,
    productVariantId: input.productVariantId ?? null,
    subscriptionPlanId: input.subscriptionPlanId ?? null,
    sourceRecommendationId: input.sourceRecommendationId ?? null,
    categoryId: product.categoryId,
    lineType: input.lineType ?? (product.isSubscription ? LineType.RECURRING : LineType.ONE_TIME),
    sequence,
    description: input.description ?? product.name,
    quantity: D(input.quantity),
    unitPrice: input.unitPrice === undefined ? listPrice : D(input.unitPrice),
    listPrice,
    unitCost: product.unitCost,
    discountPct: D(input.discountPct ?? 0),
  };
}

export async function createQuotation(input: CreateQuotationInput) {
  const quotationId = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) {
      throw new NotFoundError('Customer', input.customerId);
    }

    const quotation = await tx.quotation.create({
      data: {
        number: await nextQuotationNumber(tx),
        customerId: input.customerId,
        customerContactId: input.customerContactId ?? null,
        ownerUserId: input.ownerUserId,
        status: QuotationStatus.DRAFT,
        notes: input.notes ?? null,
      },
    });

    let sequence = 1;
    for (const line of input.lines) {
      await tx.quotationLine.create({
        data: { quotationId: quotation.id, ...(await resolveLineData(tx, line, sequence)) },
      });
      sequence += 1;
    }

    await recomputeQuotation(tx, quotation.id);
    await recordAudit(tx, {
      entityType: 'quotation',
      entityId: quotation.id,
      action: AuditAction.CREATE,
      userId: input.actorUserId,
      changes: { number: quotation.number, lineCount: input.lines.length },
    });

    return quotation.id;
  });

  return getQuotation(quotationId);
}

/** A quote may only be edited while it is a draft or has been returned to draft. */
function assertEditable(status: QuotationStatus): void {
  if (status !== QuotationStatus.DRAFT) {
    throw new ConflictError(`Quotation in status ${status} cannot be edited`);
  }
}

export async function addLine(quotationId: string, input: NewLineInput, actorUserId: string) {
  await prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUnique({
      where: { id: quotationId },
      include: { lines: { select: { sequence: true } } },
    });
    if (!quotation) {
      throw new NotFoundError('Quotation', quotationId);
    }
    assertEditable(quotation.status);

    const nextSequence = Math.max(0, ...quotation.lines.map((line) => line.sequence)) + 1;
    const created = await tx.quotationLine.create({
      data: { quotationId, ...(await resolveLineData(tx, input, nextSequence)) },
    });

    await recomputeQuotation(tx, quotationId);
    await recordAudit(tx, {
      entityType: 'quotation_line',
      entityId: created.id,
      action: AuditAction.CREATE,
      userId: actorUserId,
      changes: { quotationId, productId: created.productId, discountPct: created.discountPct.toString() },
    });
  });

  return getQuotation(quotationId);
}

export interface UpdateLineInput {
  quantity?: number;
  unitPrice?: number;
  discountPct?: number;
  description?: string | null;
}

export async function updateLine(
  quotationId: string,
  lineId: string,
  input: UpdateLineInput,
  actorUserId: string,
) {
  await prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUnique({ where: { id: quotationId } });
    if (!quotation) {
      throw new NotFoundError('Quotation', quotationId);
    }
    assertEditable(quotation.status);

    const line = await tx.quotationLine.findUnique({ where: { id: lineId } });
    if (!line || line.quotationId !== quotationId) {
      throw new NotFoundError('Quotation line', lineId);
    }

    const updated = await tx.quotationLine.update({
      where: { id: lineId },
      data: {
        ...(input.quantity !== undefined ? { quantity: D(input.quantity) } : {}),
        ...(input.unitPrice !== undefined ? { unitPrice: D(input.unitPrice) } : {}),
        ...(input.discountPct !== undefined ? { discountPct: D(input.discountPct) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });

    await recomputeQuotation(tx, quotationId);
    await recordAudit(tx, {
      entityType: 'quotation_line',
      entityId: lineId,
      // A discount change is singled out so margin giveaway is traceable.
      action: input.discountPct !== undefined ? AuditAction.DISCOUNT_EDIT : AuditAction.UPDATE,
      userId: actorUserId,
      changes: {
        before: { quantity: line.quantity.toString(), unitPrice: line.unitPrice.toString(), discountPct: line.discountPct.toString() },
        after: { quantity: updated.quantity.toString(), unitPrice: updated.unitPrice.toString(), discountPct: updated.discountPct.toString() },
      },
    });
  });

  return getQuotation(quotationId);
}

export async function deleteLine(quotationId: string, lineId: string, actorUserId: string) {
  await prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUnique({ where: { id: quotationId } });
    if (!quotation) {
      throw new NotFoundError('Quotation', quotationId);
    }
    assertEditable(quotation.status);

    const line = await tx.quotationLine.findUnique({ where: { id: lineId } });
    if (!line || line.quotationId !== quotationId) {
      throw new NotFoundError('Quotation line', lineId);
    }

    await tx.quotationLine.delete({ where: { id: lineId } });
    await recomputeQuotation(tx, quotationId);
    await recordAudit(tx, {
      entityType: 'quotation_line',
      entityId: lineId,
      action: AuditAction.DELETE,
      userId: actorUserId,
      changes: { quotationId, productId: line.productId },
    });
  });

  return getQuotation(quotationId);
}

// ---------------------------------------------------------------------------
// Submit — routing happens here, the rep never asks for approval
// ---------------------------------------------------------------------------

async function findAssigneeForLevel(
  tx: Prisma.TransactionClient,
  level: ApprovalLevel,
): Promise<string | null> {
  const userRole = await tx.userRole.findFirst({
    where: { role: { code: LEVEL_ROLE_CODE[level] }, user: { isActive: true } },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  });

  return userRole?.userId ?? null;
}

export async function submitQuotation(quotationId: string, actorUserId: string) {
  await prisma.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUnique({
      where: { id: quotationId },
      include: { lines: { select: { id: true } } },
    });
    if (!quotation) {
      throw new NotFoundError('Quotation', quotationId);
    }
    if (quotation.status !== QuotationStatus.DRAFT) {
      throw new ConflictError(`Quotation in status ${quotation.status} cannot be submitted`);
    }
    if (quotation.lines.length === 0) {
      throw new ValidationError('A quotation needs at least one line before it can be submitted');
    }

    const risk = await recomputeQuotation(tx, quotationId);

    // Superseded steps from an earlier submit are dropped; the chain is rebuilt
    // from the score the engine just returned.
    await tx.approvalStep.deleteMany({ where: { quotationId } });

    if (risk.requiredApprovalChain.length === 0) {
      await tx.quotation.update({
        where: { id: quotationId },
        data: {
          status: QuotationStatus.APPROVED,
          submittedAt: new Date(),
          approvedAt: new Date(),
          requiresApproval: false,
        },
      });

      await recordAudit(tx, {
        entityType: 'quotation',
        entityId: quotationId,
        action: AuditAction.APPROVE,
        userId: actorUserId,
        reason: 'Every line within its discount ceiling — auto-approved on submit',
        changes: { blendedScore: risk.blendedScore, riskLevel: risk.riskLevel },
      });
      return;
    }

    for (const step of risk.requiredApprovalChain) {
      await tx.approvalStep.create({
        data: {
          quotationId,
          level: step.level as ApprovalLevel,
          sequence: step.sequence,
          status: ApprovalStepStatus.PENDING,
          assigneeUserId: await findAssigneeForLevel(tx, step.level as ApprovalLevel),
        },
      });
    }

    await tx.quotation.update({
      where: { id: quotationId },
      data: {
        status: QuotationStatus.PENDING_APPROVAL,
        submittedAt: new Date(),
        requiresApproval: true,
      },
    });

    await recordAudit(tx, {
      entityType: 'quotation',
      entityId: quotationId,
      action: AuditAction.UPDATE,
      userId: actorUserId,
      reason: `Submitted — routed to approval at ${risk.riskLevel} risk`,
      changes: {
        blendedScore: risk.blendedScore,
        riskLevel: risk.riskLevel,
        chain: risk.requiredApprovalChain.map((step) => step.level),
      },
    });
  });

  return getQuotation(quotationId);
}
