// Admin / Reporting (specs screen 15).
//
//   "Filters: Period, Sales Team, Approval Status, Product. Export PDF / XLS"
//
// This module is a read-only aggregation layer. It owns no rows, decides
// nothing, and writes nothing — not even an audit entry, because reading a
// report is not an auditable act. Every number here is summed out of data the
// quotation, billing, subscription and fulfillment modules already wrote.
//
// Two rules keep the filters coherent across sections:
//
//   1. `from`/`to` apply to each entity's own date (a quotation's createdAt, a
//      sales order's orderDate, an invoice's createdAt). A period therefore
//      means "things that happened in this window", section by section.
//   2. `approvalStatus`, `productId` and `ownerId` describe a quotation.
//      Downstream rows are matched by walking back through the sales order to
//      a quotation that passes — an invoice is in scope when the quotation it
//      ultimately came from is.
//
// specs' "Sales Team" is read as the owning rep: there is no team table in the
// schema, and adding one would be a schema change for a filter the rep already
// expresses exactly.

import { InvoiceStatus, Prisma, QuotationStatus, SubscriptionStatus } from '@prisma/client';
import type {
  AppliedFilters,
  ApprovalMetrics,
  BackorderMetrics,
  BillingMetrics,
  DiscountByCategory,
  DiscountByTier,
  DiscountMetrics,
  DiscountReport,
  QuotationMetrics,
  ReportQuotationRow,
  ReportQuotationsMeta,
  ReportSummary,
  SubscriptionMetrics,
  ValueMetrics,
  QuotationStatus as QuotationStatusView,
} from '@dealflow360/shared';
import type { RiskLevel as RiskLevelView } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { renderReportPdf } from './reporting.pdf';
import type { ReportExportQuery, ReportFiltersQuery, ReportQuotationsQuery } from './reporting.schemas';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

/** Money and percentages leave as fixed-scale strings, never floats. */
function money(value: Prisma.Decimal | null | undefined): string {
  return (value ?? ZERO).toFixed(2);
}

function pct(value: Prisma.Decimal | null | undefined): string {
  return (value ?? ZERO).toFixed(2);
}

/** A share of a total, guarding the zero denominator rather than reporting 0%. */
function ratioPct(part: Prisma.Decimal, whole: Prisma.Decimal): string | null {
  if (whole.isZero()) return null;
  return part.div(whole).mul(HUNDRED).toFixed(2);
}

// ---------------------------------------------------------------------------
// Scope: one set of filters turned into the where clauses each section needs
// ---------------------------------------------------------------------------

interface Scope {
  /** Quotation filters including the period. */
  quotationWhere: Prisma.QuotationWhereInput;
  /** The same filters without the period, for walking back from a child row. */
  quotationScope: Prisma.QuotationWhereInput | null;
  /** The period on its own, to apply to a child row's own date column. */
  dateRange: { gte?: Date; lte?: Date } | null;
  /** Narrows line-level aggregates to the filtered product's own lines. */
  productId: string | null;
}

/** A bare `to=2026-09-06` means the whole of that day, not its first instant. */
function endOfDay(date: Date): Date {
  const midnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
  if (!midnight) return date;

  const widened = new Date(date);
  widened.setUTCHours(23, 59, 59, 999);
  return widened;
}

function buildScope(filters: ReportFiltersQuery): Scope {
  const dateRange =
    filters.from || filters.to
      ? {
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
        }
      : null;

  const quotationScope: Prisma.QuotationWhereInput = {
    ...(filters.approvalStatus ? { status: filters.approvalStatus as QuotationStatus } : {}),
    ...(filters.ownerId ? { ownerUserId: filters.ownerId } : {}),
    // "Quotes carrying this product" — one matching line is enough.
    ...(filters.productId ? { lines: { some: { productId: filters.productId } } } : {}),
  };

  const hasQuotationScope = Object.keys(quotationScope).length > 0;

  return {
    quotationWhere: {
      ...quotationScope,
      ...(dateRange ? { createdAt: dateRange } : {}),
    },
    quotationScope: hasQuotationScope ? quotationScope : null,
    dateRange,
    productId: filters.productId ?? null,
  };
}

/**
 * A sales order is in scope when it was placed in the period and its own
 * quotation passes the quotation filters. It reaches the quotation directly —
 * everything further downstream goes through the order.
 */
function orderWhere(scope: Scope): Prisma.SalesOrderWhereInput {
  return {
    ...(scope.dateRange ? { orderDate: scope.dateRange } : {}),
    ...(scope.quotationScope ? { quotation: scope.quotationScope } : {}),
  };
}

/**
 * A row hanging off a sales order is in scope when it was created in the
 * period and the quotation behind its order passes. Both halves are optional,
 * so an unfiltered report reads everything.
 *
 * Typed per entity rather than through one loose `Record`: a cast here would
 * have hidden the difference between this shape and `orderWhere` above.
 */
function invoiceWhere(scope: Scope): Prisma.InvoiceWhereInput {
  return {
    ...(scope.dateRange ? { createdAt: scope.dateRange } : {}),
    ...(scope.quotationScope ? { salesOrder: { quotation: scope.quotationScope } } : {}),
  };
}

function subscriptionWhere(scope: Scope): Prisma.SubscriptionWhereInput {
  return {
    ...(scope.dateRange ? { createdAt: scope.dateRange } : {}),
    ...(scope.quotationScope ? { salesOrder: { quotation: scope.quotationScope } } : {}),
  };
}

function backorderWhere(scope: Scope): Prisma.BackorderWhereInput {
  return {
    ...(scope.dateRange ? { createdAt: scope.dateRange } : {}),
    ...(scope.quotationScope ? { salesOrder: { quotation: scope.quotationScope } } : {}),
  };
}

/** Echoes the filters back with names, so a report says what it was built from. */
async function resolveAppliedFilters(filters: ReportFiltersQuery): Promise<AppliedFilters> {
  const [product, owner] = await Promise.all([
    filters.productId
      ? prisma.product.findUnique({
          where: { id: filters.productId },
          select: { id: true, sku: true, name: true },
        })
      : Promise.resolve(null),
    filters.ownerId
      ? prisma.user.findUnique({
          where: { id: filters.ownerId },
          select: { id: true, fullName: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    from: filters.from ? filters.from.toISOString() : null,
    to: filters.to ? endOfDay(filters.to).toISOString() : null,
    approvalStatus: (filters.approvalStatus as QuotationStatusView | undefined) ?? null,
    product,
    owner,
  };
}

function emptyByStatus(): Record<QuotationStatusView, number> {
  return {
    DRAFT: 0,
    PENDING_APPROVAL: 0,
    APPROVED: 0,
    NEGOTIATION: 0,
    CONFIRMED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  } as Record<QuotationStatusView, number>;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

async function quotationSection(
  scope: Scope,
): Promise<{ quotations: QuotationMetrics; value: ValueMetrics; approvals: ApprovalMetrics }> {
  const where = scope.quotationWhere;

  const [byStatus, totals, requiresApproval, approved, rejected, pending, orders] =
    await Promise.all([
      prisma.quotation.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.quotation.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          totalAmount: true,
          subtotalAmount: true,
          discountAmount: true,
          oneTimeTotalAmount: true,
          recurringTotalAmount: true,
        },
      }),
      prisma.quotation.count({ where: { ...where, requiresApproval: true } }),
      // approvedAt is stamped only by an actual approval, so a quote that was
      // approved and has since been confirmed still counts once, and a quote
      // that never needed approval never does.
      prisma.quotation.count({ where: { ...where, approvedAt: { not: null } } }),
      prisma.quotation.count({ where: { ...where, status: QuotationStatus.REJECTED } }),
      prisma.quotation.count({ where: { ...where, status: QuotationStatus.PENDING_APPROVAL } }),
      prisma.salesOrder.aggregate({
        where: orderWhere(scope),
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
    ]);

  const statusCounts = emptyByStatus();
  for (const row of byStatus) statusCounts[row.status as QuotationStatusView] = row._count._all;

  const decided = new Prisma.Decimal(approved + rejected);

  return {
    quotations: {
      total: totals._count._all,
      byStatus: statusCounts,
      requiresApproval,
    },
    value: {
      quotationTotal: money(totals._sum.totalAmount),
      oneTimeTotal: money(totals._sum.oneTimeTotalAmount),
      recurringTotal: money(totals._sum.recurringTotalAmount),
      discountTotal: money(totals._sum.discountAmount),
      orderTotal: money(orders._sum.totalAmount),
      orderCount: orders._count._all,
    },
    approvals: {
      approved,
      rejected,
      pending,
      approvalRatePct: ratioPct(new Prisma.Decimal(approved), decided),
    },
  };
}

/**
 * The headline discount numbers. The average is weighted — total discount over
 * total list value — so a large quote at 5% is not cancelled out by a tiny one
 * at 40%, which is what a mean of per-quote percentages would do.
 */
async function discountSection(scope: Scope): Promise<DiscountMetrics> {
  const lineWhere: Prisma.QuotationLineWhereInput = {
    quotation: scope.quotationWhere,
    ...(scope.productId ? { productId: scope.productId } : {}),
  };

  const [totals, overLimitLines, overLimitQuotations] = await Promise.all([
    prisma.quotation.aggregate({
      where: scope.quotationWhere,
      _sum: { discountAmount: true, subtotalAmount: true },
      _avg: { riskScore: true },
    }),
    // The engine's own snapshot: a line is over limit when it broke the
    // ceiling that applied to it. Reporting reads that column, it never
    // re-derives a ceiling (that logic belongs to the discount engine).
    prisma.quotationLine.count({ where: { ...lineWhere, overagePct: { gt: 0 } } }),
    prisma.quotation.count({
      where: { ...scope.quotationWhere, lines: { some: { overagePct: { gt: 0 } } } },
    }),
  ]);

  const discount = totals._sum.discountAmount ?? ZERO;
  const listValue = totals._sum.subtotalAmount ?? ZERO;

  return {
    averageDiscountPct: ratioPct(discount, listValue) ?? '0.00',
    averageBlendedRisk: pct(totals._avg.riskScore),
    overLimitLines,
    overLimitQuotations,
  };
}

async function billingSection(scope: Scope): Promise<BillingMetrics> {
  const where = invoiceWhere(scope);

  // A voided invoice was never owed, so it is not money invoiced.
  const live: Prisma.InvoiceWhereInput = { ...where, status: { not: InvoiceStatus.VOID } };

  const totals = await prisma.invoice.aggregate({
    where: live,
    _count: { _all: true },
    _sum: { totalAmount: true, paidAmount: true, balanceAmount: true },
  });

  return {
    invoiceCount: totals._count._all,
    invoicedAmount: money(totals._sum.totalAmount),
    paidAmount: money(totals._sum.paidAmount),
    outstandingAmount: money(totals._sum.balanceAmount),
  };
}

async function subscriptionSection(scope: Scope): Promise<SubscriptionMetrics> {
  const where = subscriptionWhere(scope);

  const [byStatus, activeValue] = await Promise.all([
    prisma.subscription.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.subscription.aggregate({
      where: { ...where, status: SubscriptionStatus.ACTIVE },
      _sum: { recurringAmount: true },
    }),
  ]);

  const counts: Record<SubscriptionStatus, number> = { ACTIVE: 0, PAUSED: 0, CANCELLED: 0 };
  for (const row of byStatus) counts[row.status] = row._count._all;

  return {
    active: counts.ACTIVE,
    paused: counts.PAUSED,
    cancelled: counts.CANCELLED,
    activeRecurringAmount: money(activeValue._sum.recurringAmount),
  };
}

async function backorderSection(scope: Scope): Promise<BackorderMetrics> {
  const where = backorderWhere(scope);

  const [open, partially, quantities] = await Promise.all([
    prisma.backorder.count({ where: { ...where, status: 'OPEN' } }),
    prisma.backorder.count({ where: { ...where, status: 'PARTIALLY_RESOLVED' } }),
    prisma.backorder.aggregate({
      where: { ...where, status: { in: ['OPEN', 'PARTIALLY_RESOLVED'] } },
      _sum: { quantity: true, quantityResolved: true },
    }),
  ]);

  const outstanding = (quantities._sum.quantity ?? ZERO).sub(quantities._sum.quantityResolved ?? ZERO);

  return { open, partiallyResolved: partially, openQuantity: outstanding.toFixed(2) };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function getSummary(filters: ReportFiltersQuery): Promise<ReportSummary> {
  const scope = buildScope(filters);

  const [applied, quotationPart, discounts, billing, subscriptions, backorders] = await Promise.all([
    resolveAppliedFilters(filters),
    quotationSection(scope),
    discountSection(scope),
    billingSection(scope),
    subscriptionSection(scope),
    backorderSection(scope),
  ]);

  return {
    filters: applied,
    generatedAt: new Date().toISOString(),
    quotations: quotationPart.quotations,
    value: quotationPart.value,
    approvals: quotationPart.approvals,
    discounts,
    billing,
    subscriptions,
    backorders,
  };
}

const quotationRowSelect = {
  id: true,
  number: true,
  status: true,
  totalAmount: true,
  subtotalAmount: true,
  discountAmount: true,
  riskScore: true,
  riskLevel: true,
  createdAt: true,
  customer: { select: { id: true, name: true, customerTier: { select: { code: true } } } },
  ownerUser: { select: { id: true, fullName: true } },
} satisfies Prisma.QuotationSelect;

type QuotationRow = Prisma.QuotationGetPayload<{ select: typeof quotationRowSelect }>;

function toReportRow(row: QuotationRow): ReportQuotationRow {
  return {
    id: row.id,
    number: row.number,
    customer: {
      id: row.customer.id,
      name: row.customer.name,
      tierCode: row.customer.customerTier?.code ?? null,
    },
    owner: { id: row.ownerUser.id, fullName: row.ownerUser.fullName },
    status: row.status as QuotationStatusView,
    totalAmount: money(row.totalAmount),
    discountAmount: money(row.discountAmount),
    discountPct: ratioPct(row.discountAmount, row.subtotalAmount) ?? '0.00',
    riskScore: pct(row.riskScore),
    riskLevel: row.riskLevel as RiskLevelView,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listReportQuotations(
  query: ReportQuotationsQuery,
): Promise<{ rows: ReportQuotationRow[]; meta: ReportQuotationsMeta }> {
  const scope = buildScope(query);

  const [rows, total, filters] = await Promise.all([
    prisma.quotation.findMany({
      where: scope.quotationWhere,
      select: quotationRowSelect,
      orderBy: [{ createdAt: 'desc' }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.quotation.count({ where: scope.quotationWhere }),
    resolveAppliedFilters(query),
  ]);

  return { rows: rows.map(toReportRow), meta: { total, filters } };
}

async function discountsByCategory(scope: Scope): Promise<DiscountByCategory[]> {
  const lineWhere: Prisma.QuotationLineWhereInput = {
    quotation: scope.quotationWhere,
    ...(scope.productId ? { productId: scope.productId } : {}),
  };

  const [grouped, scored, overLimit, categories] = await Promise.all([
    prisma.quotationLine.groupBy({
      by: ['categoryId'],
      where: lineWhere,
      _count: { _all: true },
      _avg: { discountPct: true },
    }),
    // Only lines the discount engine actually scored carry a ceiling, so the
    // average ceiling is taken over those — averaging in an unscored 0 would
    // report a ceiling nobody ever set.
    prisma.quotationLine.groupBy({
      by: ['categoryId'],
      where: { ...lineWhere, applicableCeilingPct: { gt: 0 } },
      _avg: { applicableCeilingPct: true },
    }),
    prisma.quotationLine.groupBy({
      by: ['categoryId'],
      where: { ...lineWhere, overagePct: { gt: 0 } },
      _count: { _all: true },
    }),
    prisma.category.findMany({ select: { id: true, code: true, name: true } }),
  ]);

  const byId = new Map(categories.map((row) => [row.id, row]));
  const ceilingById = new Map(scored.map((row) => [row.categoryId, row._avg.applicableCeilingPct]));
  const overById = new Map(overLimit.map((row) => [row.categoryId, row._count._all]));

  return grouped
    .map((row) => {
      const category = byId.get(row.categoryId);
      return {
        categoryId: row.categoryId,
        code: category?.code ?? 'UNKNOWN',
        name: category?.name ?? 'Unknown category',
        lineCount: row._count._all,
        averageDiscountPct: pct(row._avg.discountPct),
        averageCeilingPct: pct(ceilingById.get(row.categoryId) ?? ZERO),
        overLimitLines: overById.get(row.categoryId) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function discountsByTier(scope: Scope): Promise<DiscountByTier[]> {
  const tiers = await prisma.customerTier.findMany({
    select: { id: true, code: true, name: true, ceilingPct: true },
    orderBy: { ceilingPct: 'asc' },
  });

  return Promise.all(
    tiers.map(async (tier) => {
      const where: Prisma.QuotationWhereInput = {
        ...scope.quotationWhere,
        customer: { customerTierId: tier.id },
      };

      const [totals, overLimit] = await Promise.all([
        prisma.quotation.aggregate({
          where,
          _count: { _all: true },
          _sum: { discountAmount: true, subtotalAmount: true },
        }),
        prisma.quotation.count({ where: { ...where, lines: { some: { overagePct: { gt: 0 } } } } }),
      ]);

      return {
        tierId: tier.id,
        code: tier.code,
        name: tier.name,
        ceilingPct: pct(tier.ceilingPct),
        quotationCount: totals._count._all,
        averageDiscountPct:
          ratioPct(totals._sum.discountAmount ?? ZERO, totals._sum.subtotalAmount ?? ZERO) ?? '0.00',
        overLimitQuotations: overLimit,
      };
    }),
  );
}

export async function getDiscountReport(filters: ReportFiltersQuery): Promise<DiscountReport> {
  const scope = buildScope(filters);

  const [applied, byCategory, byTier, overall, quotationPart] = await Promise.all([
    resolveAppliedFilters(filters),
    discountsByCategory(scope),
    discountsByTier(scope),
    discountSection(scope),
    quotationSection(scope),
  ]);

  return {
    filters: applied,
    generatedAt: new Date().toISOString(),
    byCategory,
    byTier,
    overall,
    approvals: quotationPart.approvals,
  };
}

// ---------------------------------------------------------------------------
// PDF export
//
// The service gathers the same data the JSON endpoints answer with and hands
// it to the renderer; the controller only sets headers and sends the bytes.
// ---------------------------------------------------------------------------

/** Rows on an export are capped: a PDF is a report, not a data dump. */
const EXPORT_ROW_LIMIT = 200;

export async function exportReport(
  filters: ReportExportQuery,
): Promise<{ buffer: Buffer; filename: string }> {
  const [summary, quotations] = await Promise.all([
    getSummary(filters),
    listReportQuotations({ ...filters, skip: 0, take: EXPORT_ROW_LIMIT }),
  ]);

  const buffer = await renderReportPdf({
    summary,
    rows: quotations.rows,
    totalRows: quotations.meta.total,
    rowLimit: EXPORT_ROW_LIMIT,
  });

  const stamp = summary.generatedAt.slice(0, 10);
  return { buffer, filename: `dealflow360-report-${stamp}.pdf` };
}
