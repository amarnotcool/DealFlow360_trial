// Screen 15 (specs.md §6): "Filters: Period, Sales Team, Approval Status,
// Product. Export PDF."
//
// Everything here is read from /reports, which aggregates and decides nothing.
// The screen adds no arithmetic of its own: percentages, averages and totals
// arrive computed, and are formatted for display only. The export ships the
// same filters the screen is showing, so the PDF is never a different report.

import { useNavigate } from 'react-router-dom';
import type { QuotationStatus, ReportQuotationRow } from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  EmptyCard,
  ErrorCard,
  FIELD_CLASS,
  LabelledField,
  LoadingCard,
  RiskBadge,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { useReporting } from '../../../features/reporting/useReporting';
import { date, humanise, money, percent } from '../../../lib/format';

/** The stages a quotation can sit in, for the Approval Status filter. */
const STATUS_OPTIONS = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'NEGOTIATION',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
] as const;

/**
 * Status counts are only shown for stages that have something in them: a wall
 * of zeros reads as broken, and the total is on its own card anyway.
 */
function occupiedStatuses(byStatus: Record<QuotationStatus, number>) {
  return (Object.entries(byStatus) as [QuotationStatus, number][]).filter(([, count]) => count > 0);
}

export default function AdminReportingDashboard() {
  const navigate = useNavigate();
  const {
    filters,
    setFilter,
    clearFilters,
    filtered,
    summary,
    discounts,
    rows,
    rowsMeta,
    owners,
    products,
    error,
    refreshing,
    exporting,
    notice,
    exportPdf,
  } = useReporting();

  const openQuotation = (row: ReportQuotationRow) => navigate(`/quotations/${row.id}`);

  return (
    <InternalLayout
      breadcrumb={['DealFlow360']}
      title="Reports"
      actions={
        <Button onClick={() => void exportPdf()} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Export PDF'}
        </Button>
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      {notice && (
        <div className="mb-lg">
          <Card tone="lemon">
            <CardLabel>Export</CardLabel>
            <p className="mt-xs text-body-md">{notice}</p>
          </Card>
        </div>
      )}

      {/* --- Filters bar ---------------------------------------------------- */}
      <Card className="mb-lg">
        <div className="flex flex-wrap items-end gap-md">
          <div className="min-w-[9rem]">
            <LabelledField label="From">
              <input
                type="date"
                aria-label="Period from"
                className={FIELD_CLASS}
                value={filters.from}
                onChange={(event) => setFilter('from', event.target.value)}
              />
            </LabelledField>
          </div>

          <div className="min-w-[9rem]">
            <LabelledField label="To">
              <input
                type="date"
                aria-label="Period to"
                className={FIELD_CLASS}
                value={filters.to}
                onChange={(event) => setFilter('to', event.target.value)}
              />
            </LabelledField>
          </div>

          <div className="min-w-[11rem]">
            <LabelledField label="Sales rep">
              <select
                aria-label="Sales rep"
                className={FIELD_CLASS}
                value={filters.ownerId}
                onChange={(event) => setFilter('ownerId', event.target.value)}
              >
                <option value="">All reps</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.fullName} ({owner.quotationCount})
                  </option>
                ))}
              </select>
            </LabelledField>
          </div>

          <div className="min-w-[11rem]">
            <LabelledField label="Approval status">
              <select
                aria-label="Approval status"
                className={FIELD_CLASS}
                value={filters.approvalStatus}
                onChange={(event) =>
                  setFilter('approvalStatus', event.target.value as QuotationStatus | '')
                }
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {humanise(status)}
                  </option>
                ))}
              </select>
            </LabelledField>
          </div>

          <div className="min-w-[13rem] flex-1">
            <LabelledField label="Product">
              <select
                aria-label="Product"
                className={FIELD_CLASS}
                value={filters.productId}
                onChange={(event) => setFilter('productId', event.target.value)}
              >
                <option value="">All products</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
            </LabelledField>
          </div>

          {filtered && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {refreshing && summary !== null && (
          <p className="mt-sm text-body-sm text-ink-subtle">Refreshing…</p>
        )}
      </Card>

      {summary === null ? (
        <LoadingCard label="Report" />
      ) : (
        <>
          {/* --- Focal metrics --------------------------------------------- */}
          <div className="mb-lg grid gap-gutter md:grid-cols-2 xl:grid-cols-4">
            <Card tone="lemon">
              <CardLabel>Quotation value</CardLabel>
              <CardMetric>{money(summary.value.quotationTotal)}</CardMetric>
              <p className="tabular text-body-sm">
                {summary.quotations.total} quotation{summary.quotations.total === 1 ? '' : 's'} ·{' '}
                {money(summary.value.discountTotal)} discounted
              </p>
            </Card>

            <Card tone="obsidian">
              <CardLabel>Confirmed order value</CardLabel>
              <CardMetric>{money(summary.value.orderTotal)}</CardMetric>
              <p className="tabular text-body-sm text-obsidian-muted">
                {summary.value.orderCount} sales order{summary.value.orderCount === 1 ? '' : 's'} ·{' '}
                {money(summary.value.recurringTotal)} recurring
              </p>
            </Card>

            <Card tone="tangerine">
              <CardLabel>Average discount</CardLabel>
              <CardMetric>{percent(summary.discounts.averageDiscountPct)}</CardMetric>
              <p className="tabular text-body-sm">
                {summary.discounts.overLimitLines} line
                {summary.discounts.overLimitLines === 1 ? '' : 's'} over ceiling
              </p>
            </Card>

            <Card>
              <CardLabel>Average blended risk</CardLabel>
              <CardMetric>{summary.discounts.averageBlendedRisk}</CardMetric>
              <p className="tabular text-body-sm text-ink-subtle">
                {summary.quotations.requiresApproval} needed approval
              </p>
            </Card>
          </div>

          {/* --- Secondary metrics ----------------------------------------- */}
          <div className="mb-lg grid gap-gutter md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardLabel>Quotations by status</CardLabel>
              {occupiedStatuses(summary.quotations.byStatus).length === 0 ? (
                <p className="mt-sm text-body-sm text-ink-subtle">
                  No quotations in this period.
                </p>
              ) : (
                <ul className="mt-sm flex flex-col gap-2xs">
                  {occupiedStatuses(summary.quotations.byStatus).map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between gap-sm">
                      <span className="text-body-sm text-ink-body">{humanise(status)}</span>
                      <span className="tabular text-body-md text-ink">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardLabel>Approvals</CardLabel>
              <ul className="mt-sm flex flex-col gap-2xs">
                <li className="flex items-center justify-between gap-sm">
                  <span className="text-body-sm text-ink-body">Approved</span>
                  <span className="tabular text-body-md text-ink">{summary.approvals.approved}</span>
                </li>
                <li className="flex items-center justify-between gap-sm">
                  <span className="text-body-sm text-ink-body">Rejected</span>
                  <span className="tabular text-body-md text-ink">{summary.approvals.rejected}</span>
                </li>
                <li className="flex items-center justify-between gap-sm">
                  <span className="text-body-sm text-ink-body">Pending approval</span>
                  <span className="tabular text-body-md text-ink">{summary.approvals.pending}</span>
                </li>
                <li className="flex items-center justify-between gap-sm border-t border-hairline pt-2xs">
                  <span className="text-body-sm text-ink-body">Approval rate</span>
                  {/* Null means nothing has been decided yet, which is not 0%. */}
                  <span className="tabular text-body-md text-ink">
                    {summary.approvals.approvalRatePct === null
                      ? 'Nothing decided yet'
                      : percent(summary.approvals.approvalRatePct)}
                  </span>
                </li>
              </ul>
            </Card>

            <Card>
              <CardLabel>Billing &amp; commitments</CardLabel>
              <ul className="mt-sm flex flex-col gap-2xs">
                <li className="flex items-center justify-between gap-sm">
                  <span className="text-body-sm text-ink-body">
                    Invoiced ({summary.billing.invoiceCount})
                  </span>
                  <span className="tabular text-body-md text-ink">
                    {money(summary.billing.invoicedAmount)}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-sm">
                  <span className="text-body-sm text-ink-body">Paid</span>
                  <span className="tabular text-body-md text-ink">
                    {money(summary.billing.paidAmount)}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-sm">
                  <span className="text-body-sm text-ink-body">Outstanding</span>
                  <span className="tabular text-body-md text-ink">
                    {money(summary.billing.outstandingAmount)}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-sm border-t border-hairline pt-2xs">
                  <span className="text-body-sm text-ink-body">Active subscriptions</span>
                  <span className="tabular text-body-md text-ink">
                    {summary.subscriptions.active} · {money(summary.subscriptions.activeRecurringAmount)}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-sm">
                  <span className="text-body-sm text-ink-body">Open backorders</span>
                  <span className="tabular text-body-md text-ink">
                    {summary.backorders.open + summary.backorders.partiallyResolved}
                  </span>
                </li>
              </ul>
            </Card>
          </div>

          {/* --- Discount analysis ----------------------------------------- */}
          {discounts && (
            <div className="mb-lg grid gap-gutter xl:grid-cols-2">
              <TableShell>
                <TableToolbar>
                  <div>
                    <CardLabel>Discount by category</CardLabel>
                    <p className="mt-2xs text-body-sm text-ink-subtle">
                      Average line discount against the ceiling that applied.
                    </p>
                  </div>
                </TableToolbar>
                {discounts.byCategory.length === 0 ? (
                  <div className="px-lg pb-lg">
                    <p className="text-body-sm text-ink-subtle">
                      No quotation lines match these filters.
                    </p>
                  </div>
                ) : (
                  <Table aria-label="Discount by category">
                    <thead>
                      <tr>
                        <Th>Category</Th>
                        <Th className="text-right">Lines</Th>
                        <Th className="text-right">Avg discount</Th>
                        <Th className="text-right">Avg ceiling</Th>
                        <Th className="text-right">Over limit</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {discounts.byCategory.map((category) => (
                        <Tr key={category.categoryId}>
                          <Td>{category.name}</Td>
                          <Td numeric>{category.lineCount}</Td>
                          <Td numeric>{percent(category.averageDiscountPct)}</Td>
                          <Td numeric>
                            {/* A zero ceiling means no line here was ever scored
                                by the discount engine, not a ceiling of zero. */}
                            {Number(category.averageCeilingPct) > 0
                              ? percent(category.averageCeilingPct)
                              : '—'}
                          </Td>
                          <Td numeric>
                            {category.overLimitLines > 0 ? (
                              <Badge variant="critical">{category.overLimitLines}</Badge>
                            ) : (
                              '0'
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </TableShell>

              <TableShell>
                <TableToolbar>
                  <div>
                    <CardLabel>Discount by customer tier</CardLabel>
                    <p className="mt-2xs text-body-sm text-ink-subtle">
                      Weighted: total discount over total list value.
                    </p>
                  </div>
                </TableToolbar>
                {discounts.byTier.length === 0 ? (
                  <div className="px-lg pb-lg">
                    <p className="text-body-sm text-ink-subtle">No customer tiers are configured.</p>
                  </div>
                ) : (
                  <Table aria-label="Discount by customer tier">
                    <thead>
                      <tr>
                        <Th>Tier</Th>
                        <Th className="text-right">Ceiling</Th>
                        <Th className="text-right">Quotations</Th>
                        <Th className="text-right">Avg discount</Th>
                        <Th className="text-right">Over limit</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {discounts.byTier.map((tier) => (
                        <Tr key={tier.tierId}>
                          <Td>{tier.name}</Td>
                          <Td numeric>{percent(tier.ceilingPct)}</Td>
                          <Td numeric>{tier.quotationCount}</Td>
                          <Td numeric>{percent(tier.averageDiscountPct)}</Td>
                          <Td numeric>
                            {tier.overLimitQuotations > 0 ? (
                              <Badge variant="critical">{tier.overLimitQuotations}</Badge>
                            ) : (
                              '0'
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </TableShell>
            </div>
          )}

          {/* --- Quotations breakdown -------------------------------------- */}
          {rows === null ? (
            <LoadingCard label="Quotations breakdown" />
          ) : rows.length === 0 ? (
            <EmptyCard
              message={
                filtered
                  ? 'No quotations match these filters.'
                  : 'No quotations have been raised yet.'
              }
            />
          ) : (
            <TableShell>
              <TableToolbar>
                <div>
                  <CardLabel>Quotations breakdown</CardLabel>
                  <p className="mt-2xs text-body-sm text-ink-subtle">
                    {rowsMeta && rowsMeta.total > rows.length
                      ? `Showing ${rows.length} of ${rowsMeta.total} matching quotations — export the PDF for the rest.`
                      : `${rows.length} quotation${rows.length === 1 ? '' : 's'}`}
                  </p>
                </div>
              </TableToolbar>

              <Table aria-label="Quotations breakdown">
                <thead>
                  <tr>
                    <Th>Number</Th>
                    <Th>Customer</Th>
                    <Th>Owner</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Discount</Th>
                    <Th>Risk</Th>
                    <Th>Date</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Tr
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => openQuotation(row)}
                      title={`Open ${row.number}`}
                    >
                      <Td className="text-ink">{row.number}</Td>
                      <Td>
                        {row.customer.name}
                        {row.customer.tierCode && (
                          <span className="ml-xs text-ink-subtle">{row.customer.tierCode}</span>
                        )}
                      </Td>
                      <Td>{row.owner.fullName}</Td>
                      <Td>
                        <Badge variant="neutral">{humanise(row.status)}</Badge>
                      </Td>
                      <Td numeric>{money(row.totalAmount)}</Td>
                      <Td numeric>{percent(row.discountPct)}</Td>
                      <Td>
                        <RiskBadge level={row.riskLevel} score={row.riskScore} />
                      </Td>
                      <Td>{date(row.createdAt)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableShell>
          )}
        </>
      )}
    </InternalLayout>
  );
}
