// Discount ceiling configuration (specs.md screen 18, phase 1).
//
// The engine is not touched here. `discount_rule` rows are the ceilings
// `loadCeilings()` hands the engine, so editing a row is all it takes for new
// work to be scored against the new number.
//
// Two columns carry a tier's ceiling:
//
//   discount_rule.ceiling_pct   what the engine applies
//   customer_tier.ceiling_pct   display only — customers, quotations, reports
//
// Nothing reads the second one for a decision, but the screens that show it
// would be lying the moment the two disagree. So a tier's ceiling is edited
// through its rule and both columns are written in one transaction; there is no
// second write path that could reintroduce the drift.

import { Prisma } from '@prisma/client';
import {
  AuditAction,
  RiskLevel,
  type ApprovalRoutingView,
  type DiscountConfigView,
  type DiscountRuleListMeta,
  type DiscountRuleView,
} from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import { computeDiscountRisk } from '../discount-engine/discount-engine.service';

const ruleInclude = {
  customerTier: { select: { id: true, code: true, name: true, ceilingPct: true } },
  category: { select: { id: true, code: true, name: true } },
} satisfies Prisma.DiscountRuleInclude;

type RuleRow = Prisma.DiscountRuleGetPayload<{ include: typeof ruleInclude }>;

function toView(row: RuleRow): DiscountRuleView {
  const scope = row.customerTierId ? 'TIER' : row.categoryId ? 'CATEGORY' : 'GLOBAL';

  return {
    id: row.id,
    scope,
    label:
      row.customerTier?.name ?? row.category?.name ?? 'Every other line (global backstop)',
    ceilingPct: row.ceilingPct.toFixed(2),
    description: row.description,
    isActive: row.isActive,
    customerTier: row.customerTier
      ? { id: row.customerTier.id, code: row.customerTier.code, name: row.customerTier.name }
      : null,
    category: row.category,
    tierCeilingPct: row.customerTier ? row.customerTier.ceilingPct.toFixed(2) : null,
  };
}

/** Tier ceilings first, then category ceilings, then the backstop. */
const SCOPE_ORDER = { TIER: 0, CATEGORY: 1, GLOBAL: 2 } as const;

// ---------------------------------------------------------------------------
// The routing the engine applies today
//
// Phase 2 makes these editable. Until then the screen still has to show what
// actually routes a quotation, and a hand-written copy of the numbers would go
// stale the moment the engine changed. So they are measured by running the
// engine itself: one line whose overage is x scores maxSingleOverage = x and
// totalOverage = x, and the blend 0.6x + 0.4x is x — so the blended score is
// the probe value, and the level it lands in is the engine's own answer.
// ---------------------------------------------------------------------------

function probe(overagePct: number) {
  return computeDiscountRisk({
    lines: [
      {
        lineId: 'probe',
        categoryId: 'probe',
        tierCeilingPct: 0,
        categoryCeilingPct: 0,
        discountPct: overagePct,
      },
    ],
  });
}

/** The smallest score, in whole hundredths, that the engine calls HIGH risk. */
function findHighRiskThreshold(): number {
  let low = 1; // 0.01 — the smallest overage there is
  let high = 10_000; // 100.00, far past any real ceiling breach

  if (probe(high / 100).riskLevel !== RiskLevel.HIGH) return high;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (probe(mid / 100).riskLevel === RiskLevel.HIGH) high = mid;
    else low = mid + 1;
  }

  return low;
}

function chainOf(overagePct: number): string[] {
  return probe(overagePct).requiredApprovalChain.map((step) => step.level);
}

export function describeApprovalRouting(): ApprovalRoutingView {
  const thresholdHundredths = findHighRiskThreshold();
  const threshold = (thresholdHundredths / 100).toFixed(2);
  const belowThreshold = ((thresholdHundredths - 1) / 100).toFixed(2);

  return {
    highRiskThreshold: threshold,
    bands: [
      { riskLevel: RiskLevel.NONE, range: '0.00', chain: chainOf(0) },
      {
        riskLevel: RiskLevel.MEDIUM,
        range: `0.01 – ${belowThreshold}`,
        chain: chainOf(0.01),
      },
      {
        riskLevel: RiskLevel.HIGH,
        range: `${threshold} and above`,
        chain: chainOf(thresholdHundredths / 100),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listDiscountConfig(): Promise<{
  data: DiscountConfigView;
  meta: DiscountRuleListMeta;
}> {
  const rows = await prisma.discountRule.findMany({
    where: { isActive: true },
    include: ruleInclude,
  });

  const rules = rows
    .map(toView)
    .sort(
      (a, b) =>
        SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope] ||
        Number(a.ceilingPct) - Number(b.ceilingPct) ||
        a.label.localeCompare(b.label),
    );

  // A tier rule and its tier's displayed ceiling are written together, so this
  // is always true — reported rather than assumed, so a drift would show.
  const inSync = rules.every(
    (rule) => rule.tierCeilingPct === null || rule.tierCeilingPct === rule.ceilingPct,
  );

  return {
    data: { rules, approvalRouting: describeApprovalRouting() },
    meta: { total: rules.length, inSync },
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Changes one ceiling.
 *
 * Only the rule row moves. Quotation lines already carry the ceiling and
 * overage they were scored against, frozen on the line, and nothing here
 * recomputes them — a quote that was approved under the old ceiling keeps the
 * numbers it was approved on. The new ceiling reaches a quotation the next time
 * that quotation is itself recomputed (a line edited, submitted, or a
 * negotiation answered).
 */
export async function updateDiscountRuleCeiling(
  id: string,
  ceilingPct: number,
  actorUserId: string,
  reason: string | null,
): Promise<DiscountRuleView> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.discountRule.findUnique({ where: { id }, include: ruleInclude });
    if (!existing) throw new NotFoundError('Discount rule', id);
    if (!existing.isActive) {
      throw new ValidationError('An inactive discount rule cannot be edited');
    }

    const next = new Prisma.Decimal(ceilingPct.toFixed(2));
    const before = existing.ceilingPct;

    await tx.discountRule.update({ where: { id }, data: { ceilingPct: next } });

    const changes: Record<string, { from: string; to: string }> = {
      ceilingPct: { from: before.toFixed(2), to: next.toFixed(2) },
    };

    // The display column moves with it, in the same transaction, so the two can
    // never be seen disagreeing.
    if (existing.customerTierId) {
      const tierBefore = existing.customerTier?.ceilingPct ?? before;
      await tx.customerTier.update({
        where: { id: existing.customerTierId },
        data: { ceilingPct: next },
      });
      changes.tierCeilingPct = { from: tierBefore.toFixed(2), to: next.toFixed(2) };
    }

    await recordAudit(tx, {
      entityType: 'discount_rule',
      entityId: id,
      action: AuditAction.UPDATE,
      userId: actorUserId,
      reason:
        reason ??
        `Ceiling for ${toView(existing).label} changed from ${before.toFixed(2)}% to ${next.toFixed(2)}%`,
      changes,
    });

    // Re-read so the tier's own column is reflected in what the caller gets.
    const fresh = await tx.discountRule.findUniqueOrThrow({ where: { id }, include: ruleInclude });
    return toView(fresh);
  });
}
