// Discount ceiling configuration (specs.md screen 18, phase 1).
//
// A `discount_rule` row is what the engine actually applies: `loadCeilings()`
// reads them, and the engine takes the ceilings as plain input. Editing a rule
// therefore changes what new work is scored against without any engine change.

/** Which axis a rule is scoped to. Rules are single-axis, exactly as seeded. */
export type DiscountRuleScope = 'TIER' | 'CATEGORY' | 'GLOBAL';

export interface DiscountRuleView {
  id: string;
  scope: DiscountRuleScope;
  /** What the rule applies to, ready to render: "Gold", "Hardware", or the backstop. */
  label: string;
  ceilingPct: string;
  description: string | null;
  isActive: boolean;
  /** Set on a TIER rule only. */
  customerTier: { id: string; code: string; name: string } | null;
  /** Set on a CATEGORY rule only. */
  category: { id: string; code: string; name: string } | null;
  /**
   * What `customer_tier.ceiling_pct` currently says, on a TIER rule.
   *
   * That column is display-only — the engine never reads it — so the two are
   * kept identical by writing them together. Surfacing it here means a drift
   * would be visible rather than silent.
   */
  tierCeilingPct: string | null;
}

export interface DiscountRuleListMeta {
  total: number;
  /** True when every tier rule matches its tier's displayed ceiling. */
  inSync: boolean;
}

/** PATCH /discount-rules/:id */
export interface UpdateDiscountRuleInput {
  ceilingPct: number;
  reason?: string | null;
}

/**
 * The routing the discount engine applies today (phase 2 makes it editable).
 *
 * These numbers are read straight off the engine's own constants, so the screen
 * cannot drift from what actually routes a quotation.
 */
export interface ApprovalRoutingView {
  /** Blended score at or above which Finance joins the chain. */
  highRiskThreshold: string;
  bands: Array<{
    riskLevel: string;
    /** Human range, e.g. "0" or "0.01 – 4.99". */
    range: string;
    /** The chain in order; empty means auto-approved. */
    chain: string[];
  }>;
}

/** GET /discount-rules answers with both, so the screen is one read. */
export interface DiscountConfigView {
  rules: DiscountRuleView[];
  approvalRouting: ApprovalRoutingView;
}
