// Wire shapes for screen 15 (Admin / Reporting).
//
// Reporting is a read-only aggregation layer over data the other modules
// already own: it summarises, it never decides. Money and percentages cross
// as strings, the way Prisma serialises Decimal.

import type { QuotationStatus } from './quotation';
import type { RiskLevel } from './risk-score';

/**
 * The filters every reporting endpoint accepts. All optional, all combinable.
 *
 * `from`/`to` are ISO dates applied to each entity's own created date, so a
 * period means the same thing whichever section of the report reads it.
 * `approvalStatus`, `productId` and `ownerId` are quotation-scoped: downstream
 * rows (invoices, subscriptions, backorders) are matched through the sales
 * order back to a quotation that passes the filter.
 *
 * There is no team table in the schema, so specs' "Sales Team" filter is the
 * owning rep — `ownerId`.
 */
export interface ReportFilters {
  from?: string;
  to?: string;
  approvalStatus?: QuotationStatus;
  productId?: string;
  ownerId?: string;
}

/** The filters a response was built with, echoed back with readable labels. */
export interface AppliedFilters {
  from: string | null;
  to: string | null;
  approvalStatus: QuotationStatus | null;
  product: { id: string; sku: string; name: string } | null;
  owner: { id: string; fullName: string } | null;
}

export interface QuotationMetrics {
  total: number;
  byStatus: Record<QuotationStatus, number>;
  /** Quotations whose discounts pushed them into the approval chain. */
  requiresApproval: number;
}

export interface ValueMetrics {
  /** Sum of quotation totals in scope. */
  quotationTotal: string;
  oneTimeTotal: string;
  recurringTotal: string;
  discountTotal: string;
  /** Confirmed sales orders only — value that actually became an order. */
  orderTotal: string;
  orderCount: number;
}

export interface ApprovalMetrics {
  approved: number;
  rejected: number;
  pending: number;
  /**
   * approved / (approved + rejected), in percent. Null while nothing has been
   * decided — a rate off a zero denominator would read as 0% success.
   */
  approvalRatePct: string | null;
}

export interface DiscountMetrics {
  /**
   * Weighted, not a mean of means: total discount over total list value, so a
   * large quote at 5% is not cancelled out by a tiny quote at 40%.
   */
  averageDiscountPct: string;
  /** The blended score specs.md §3 computes, averaged over quotations in scope. */
  averageBlendedRisk: string;
  /** Lines that broke their own applicable ceiling. */
  overLimitLines: number;
  overLimitQuotations: number;
}

export interface BillingMetrics {
  invoiceCount: number;
  invoicedAmount: string;
  paidAmount: string;
  outstandingAmount: string;
}

export interface SubscriptionMetrics {
  active: number;
  paused: number;
  cancelled: number;
  /** Recurring value per cycle across active subscriptions. */
  activeRecurringAmount: string;
}

export interface BackorderMetrics {
  open: number;
  partiallyResolved: number;
  openQuantity: string;
}

/**
 * One entry of the report's "Sales Team" filter. specs screen 15 filters by
 * team; the schema has no team, so the grain is the rep who owns the work.
 *
 * This is not the staff directory — that is admin-only (`GET /users`). It is
 * the reps who actually own quotations, which is exactly what the filter can
 * usefully offer, and it carries no email, role or account state.
 */
export interface ReportOwnerOption {
  id: string;
  fullName: string;
  /** How many quotations this rep owns, so the picker can show the weight. */
  quotationCount: number;
}

/** GET /reports/summary */
export interface ReportSummary {
  filters: AppliedFilters;
  generatedAt: string;
  quotations: QuotationMetrics;
  value: ValueMetrics;
  approvals: ApprovalMetrics;
  discounts: DiscountMetrics;
  billing: BillingMetrics;
  subscriptions: SubscriptionMetrics;
  backorders: BackorderMetrics;
}

/** One row of the GET /reports/quotations breakdown table. */
export interface ReportQuotationRow {
  id: string;
  number: string;
  customer: { id: string; name: string; tierCode: string | null };
  owner: { id: string; fullName: string };
  status: QuotationStatus;
  totalAmount: string;
  discountAmount: string;
  discountPct: string;
  riskScore: string;
  riskLevel: RiskLevel;
  createdAt: string;
}

export interface ReportQuotationsMeta {
  total: number;
  filters: AppliedFilters;
}

/** GET /reports/discounts — average discount by category and by tier. */
export interface DiscountByCategory {
  categoryId: string;
  code: string;
  name: string;
  lineCount: number;
  averageDiscountPct: string;
  averageCeilingPct: string;
  overLimitLines: number;
}

export interface DiscountByTier {
  tierId: string;
  code: string;
  name: string;
  ceilingPct: string;
  quotationCount: number;
  averageDiscountPct: string;
  overLimitQuotations: number;
}

export interface DiscountReport {
  filters: AppliedFilters;
  generatedAt: string;
  byCategory: DiscountByCategory[];
  byTier: DiscountByTier[];
  overall: DiscountMetrics;
  approvals: ApprovalMetrics;
}
