// The blended discount risk engine (specs.md §3).
//
// Pure logic per CLAUDE.md rule 1: no Prisma, no Express, no I/O. Plain objects
// in, plain objects out. Ceilings are supplied by the caller; this file never
// looks anything up.
//
// Percentages are decimal percent at Decimal(6,2) scale. To keep results
// deterministic and free of floating-point drift, every percentage is converted
// to an integer number of hundredths, all arithmetic happens on those integers,
// and results are converted back at the end.

import {
  RiskLevel,
  type DiscountEngineInput,
  type DiscountEngineLineResult,
  type DiscountEngineResult,
  type RequiredApprovalStep,
} from '@dealflow360/shared';

/** Blended score weights (specs.md §3): worst single line vs. the whole pattern. */
const MAX_SINGLE_WEIGHT = 6; // 0.6, expressed in tenths
const TOTAL_WEIGHT = 4; // 0.4, expressed in tenths
const WEIGHT_DIVISOR = 10;

/** Score at or above which the chain escalates to Finance as well. */
const HIGH_RISK_THRESHOLD_HUNDREDTHS = 500; // blended score 5.00

const HUNDREDTHS = 100;

/** A percentage at Decimal(6,2) scale as an integer count of hundredths. */
function toHundredths(percentage: number): number {
  return Math.round(percentage * HUNDREDTHS);
}

/** Back to a 2-decimal-place percentage. */
function fromHundredths(hundredths: number): number {
  return hundredths / HUNDREDTHS;
}

export function computeDiscountRisk(input: DiscountEngineInput): DiscountEngineResult {
  const lines: DiscountEngineLineResult[] = [];

  let maxSingleOverageHundredths = 0;
  let totalOverageHundredths = 0;

  for (const line of input.lines) {
    const tierCeiling = toHundredths(line.tierCeilingPct);
    const categoryCeiling = toHundredths(line.categoryCeilingPct);
    const discount = toHundredths(line.discountPct);

    const applicableCeiling = Math.min(tierCeiling, categoryCeiling);
    const overage = Math.max(0, discount - applicableCeiling);

    maxSingleOverageHundredths = Math.max(maxSingleOverageHundredths, overage);
    totalOverageHundredths += overage;

    lines.push({
      lineId: line.lineId,
      applicableCeilingPct: fromHundredths(applicableCeiling),
      overagePct: fromHundredths(overage),
    });
  }

  // blended = 0.6 * maxSingleOverage + 0.4 * totalOverage
  const blendedScoreHundredths = Math.round(
    (MAX_SINGLE_WEIGHT * maxSingleOverageHundredths + TOTAL_WEIGHT * totalOverageHundredths) /
      WEIGHT_DIVISOR,
  );

  const riskLevel = resolveRiskLevel(blendedScoreHundredths);

  return {
    lines,
    maxSingleOverage: fromHundredths(maxSingleOverageHundredths),
    totalOverage: fromHundredths(totalOverageHundredths),
    blendedScore: fromHundredths(blendedScoreHundredths),
    riskLevel,
    requiredApprovalChain: resolveApprovalChain(riskLevel),
  };
}

/**
 * Half-open, gap-free bands over the whole number line — there is no
 * "no matching band" case. A score of exactly 0 is an explicit auto-approve,
 * not an error.
 */
function resolveRiskLevel(blendedScoreHundredths: number): RiskLevel {
  if (blendedScoreHundredths <= 0) {
    return RiskLevel.NONE;
  }
  if (blendedScoreHundredths < HIGH_RISK_THRESHOLD_HUNDREDTHS) {
    return RiskLevel.MEDIUM;
  }
  return RiskLevel.HIGH;
}

function resolveApprovalChain(riskLevel: RiskLevel): RequiredApprovalStep[] {
  switch (riskLevel) {
    case RiskLevel.NONE:
      return [];
    case RiskLevel.MEDIUM:
      return [{ level: 'SALES_MANAGER', sequence: 1 }];
    case RiskLevel.HIGH:
      return [
        { level: 'SALES_MANAGER', sequence: 1 },
        { level: 'FINANCE', sequence: 2 },
      ];
  }
}
