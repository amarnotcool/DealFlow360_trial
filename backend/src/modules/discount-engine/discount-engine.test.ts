import { describe, expect, it } from 'vitest';
import { RiskLevel, type DiscountEngineInput } from '@dealflow360/shared';

import { computeDiscountRisk } from './discount-engine.service';

// Inputs are built here on purpose: the engine is pure, so these tests never
// touch the database or the seed.

describe('computeDiscountRisk', () => {
  it('flags the specs.md §3 worked example as HIGH risk on one bad line', () => {
    const input: DiscountEngineInput = {
      lines: [
        { lineId: 'laptop', categoryId: 'hardware', tierCeilingPct: 15, categoryCeilingPct: 15, discountPct: 12 },
        { lineId: 'setup', categoryId: 'services', tierCeilingPct: 15, categoryCeilingPct: 10, discountPct: 18 },
        { lineId: 'warranty', categoryId: 'hardware', tierCeilingPct: 15, categoryCeilingPct: 15, discountPct: 10 },
      ],
    };

    const result = computeDiscountRisk(input);

    expect(result.lines).toEqual([
      { lineId: 'laptop', applicableCeilingPct: 15, overagePct: 0 },
      { lineId: 'setup', applicableCeilingPct: 10, overagePct: 8 },
      { lineId: 'warranty', applicableCeilingPct: 15, overagePct: 0 },
    ]);
    expect(result.maxSingleOverage).toBe(8);
    expect(result.totalOverage).toBe(8);
    expect(result.blendedScore).toBe(8);
    expect(result.riskLevel).toBe(RiskLevel.HIGH);
    expect(result.requiredApprovalChain).toEqual([
      { level: 'SALES_MANAGER', sequence: 1 },
      { level: 'FINANCE', sequence: 2 },
    ]);
  });

  it('routes many small overages to approval even though no single line is alarming', () => {
    const input: DiscountEngineInput = {
      lines: [
        { lineId: 'a', categoryId: 'services', tierCeilingPct: 15, categoryCeilingPct: 10, discountPct: 12 },
        { lineId: 'b', categoryId: 'services', tierCeilingPct: 15, categoryCeilingPct: 10, discountPct: 13 },
        { lineId: 'c', categoryId: 'services', tierCeilingPct: 15, categoryCeilingPct: 10, discountPct: 12 },
      ],
    };

    const result = computeDiscountRisk(input);

    expect(result.lines.map((line) => line.overagePct)).toEqual([2, 3, 2]);
    expect(result.maxSingleOverage).toBe(3);
    expect(result.totalOverage).toBe(7);
    // 0.6 * 3 + 0.4 * 7 = 4.6 — no line reaches 5 on its own.
    expect(result.blendedScore).toBe(4.6);
    expect(result.riskLevel).toBe(RiskLevel.MEDIUM);
    expect(result.requiredApprovalChain).toEqual([{ level: 'SALES_MANAGER', sequence: 1 }]);
  });

  it('auto-approves when every line is within its limit', () => {
    const input: DiscountEngineInput = {
      lines: [
        { lineId: 'laptop', categoryId: 'hardware', tierCeilingPct: 15, categoryCeilingPct: 15, discountPct: 15 },
        { lineId: 'setup', categoryId: 'services', tierCeilingPct: 15, categoryCeilingPct: 10, discountPct: 8 },
        { lineId: 'warranty', categoryId: 'hardware', tierCeilingPct: 12, categoryCeilingPct: 15, discountPct: 0 },
      ],
    };

    const result = computeDiscountRisk(input);

    expect(result.lines.map((line) => line.overagePct)).toEqual([0, 0, 0]);
    expect(result.maxSingleOverage).toBe(0);
    expect(result.totalOverage).toBe(0);
    expect(result.blendedScore).toBe(0);
    expect(result.riskLevel).toBe(RiskLevel.NONE);
    expect(result.requiredApprovalChain).toEqual([]);
  });
});
