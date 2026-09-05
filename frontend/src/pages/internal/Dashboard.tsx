// Screen 2 (specs.md §6): the sales dashboard — one landing screen, four faces.
//
// Every role lands here after login and sees only the summary its own work
// needs: a rep sees their own pipeline, the approval desk sees what awaits a
// decision, finance sees money outstanding, and an admin sees the platform at
// a glance. Each number comes from an endpoint the role is already allowed to
// read, so the dashboard opens no new data access — and every metric links to
// the module that works it. No dead numbers.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type {
  AlertView,
  ApiError,
  ApprovalListItem,
  InvoiceListItem,
  InvoiceListMeta,
  QuotationListItem,
  ReportSummary,
  SubscriptionListMeta,
} from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Card,
  CardLabel,
  CardMetric,
  EmptyCard,
  ErrorCard,
  LoadingCard,
  RiskBadge,
  Table,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { useAuth } from '../../../features/auth/useAuth';
import { fetchApprovals } from '../../../features/approvals/approvals.api';
import { fetchCustomers } from '../../../features/customers/customers.api';
import { fetchAlerts } from '../../../features/deal-health/deal-health.api';
import { fetchBackorders } from '../../../features/fulfillment/fulfillment.api';
import { fetchInvoices } from '../../../features/invoices/invoices.api';
import { fetchProducts } from '../../../features/products/products.api';
import { EMPTY_FILTERS, fetchSummary } from '../../../features/reporting/reporting.api';
import { fetchQuotations } from '../../../features/quotations/quotations.api';
import { fetchSubscriptions } from '../../../features/subscriptions/subscriptions.api';
import { fetchUsers } from '../../../features/users/users.api';
import { date, humanise, money } from '../../../lib/format';

/** Stages that still need someone to do something. Plain strings compared with
 *  String(...): shared enums cannot cross into the Vite bundle as values. */
const OPEN_QUOTATION_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'NEGOTIATION'];

/** Dashboard sections name names, not pages: four rows, then the module. */
const PREVIEW_COUNT = 4;

function isOpenQuotation(row: QuotationListItem): boolean {
  return OPEN_QUOTATION_STATUSES.includes(String(row.status));
}

/** Oldest submitted first, unsubmitted last — ISO strings sort as written. */
function bySubmittedAt(a: ApprovalListItem, b: ApprovalListItem): number {
  return (a.submittedAt ?? '9999').localeCompare(b.submittedAt ?? '9999');
}

interface MetricCardProps {
  tone?: 'frost' | 'lemon' | 'tangerine' | 'obsidian';
  label: string;
  value: string;
  sub?: string;
  /** Every metric opens the module that works it — none is decorative. */
  to: string;
}

function MetricCard({ tone = 'frost', label, value, sub, to }: MetricCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      tone={tone}
      className="cursor-pointer transition-all duration-150 hover:-translate-y-px"
      onClick={() => navigate(to)}
      title={`${label} — open`}
    >
      <CardLabel>{label}</CardLabel>
      <CardMetric>{value}</CardMetric>
      {sub && <p className="mt-xs text-body-sm opacity-80">{sub}</p>}
    </Card>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-md mt-2xl text-title-md text-ink">{children}</h2>;
}

// ---------------------------------------------------------------------------
// Sales Rep: their own pipeline. The quotations list is readable by every
// role, so "mine" is a display filter on owner — not a data boundary.
// ---------------------------------------------------------------------------

function RepDashboard({ quotations, userId }: { quotations: QuotationListItem[]; userId: string }) {
  const navigate = useNavigate();

  const mine = quotations.filter((row) => row.ownerUser.id === userId);
  const drafts = mine.filter((row) => String(row.status) === 'DRAFT');
  const awaiting = mine.filter((row) => String(row.status) === 'PENDING_APPROVAL');
  const open = mine.filter(isOpenQuotation);

  return (
    <>
      <div className="grid gap-gutter sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          tone="lemon"
          label="My open quotations"
          value={String(open.length)}
          sub={`${drafts.length} drafts · ${awaiting.length} awaiting approval`}
          to="/quotations"
        />
        <MetricCard
          tone="tangerine"
          label="Awaiting approval"
          value={String(awaiting.length)}
          sub={awaiting.length === 0 ? 'Nothing with the desk' : 'Submitted, waiting on a decision'}
          to="/quotations"
        />
        <MetricCard
          tone="frost"
          label="Drafts in progress"
          value={String(drafts.length)}
          sub={drafts.length === 0 ? 'No unfinished drafts' : 'Finish and submit them'}
          to="/quotations"
        />
      </div>

      <SectionTitle>My open quotations</SectionTitle>
      {open.length === 0 ? (
        <EmptyCard message="You have no open quotations — new drafts start on the Quotations screen." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Customer</Th>
              <Th className="text-right">Total</Th>
              <Th>Risk</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {open.slice(0, PREVIEW_COUNT).map((row) => (
              <Tr
                key={row.id}
                className="cursor-pointer"
                onClick={() => navigate(`/quotations/${row.id}`)}
              >
                <Td className="font-semibold text-ink">{row.number}</Td>
                <Td>{row.customer.name}</Td>
                <Td numeric>{money(row.totalAmount)}</Td>
                <Td>
                  <RiskBadge level={row.riskLevel} score={Number(row.riskScore).toFixed(2)} />
                </Td>
                <Td>
                  <Badge variant="neutral">{humanise(row.status)}</Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sales Manager: the approval desk plus the deal-health board (specs.md §2).
// "Mine to decide" is a current step sitting at the SALES_MANAGER level.
// ---------------------------------------------------------------------------

function ManagerDashboard({
  quotations,
  approvals,
  alerts,
  openAlerts,
}: {
  quotations: QuotationListItem[];
  approvals: ApprovalListItem[];
  alerts: AlertView[];
  openAlerts: number;
}) {
  const navigate = useNavigate();

  const open = quotations.filter(isOpenQuotation);
  const myDesk = approvals
    .filter((row) => row.currentStep && String(row.currentStep.level) === 'SALES_MANAGER')
    .sort(bySubmittedAt);
  const preview = alerts.slice(0, PREVIEW_COUNT);

  return (
    <>
      <div className="grid gap-gutter sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          tone="lemon"
          label="Awaiting my decision"
          value={String(myDesk.length)}
          sub={myDesk.length === 0 ? 'Desk is clear' : 'Oldest first, below'}
          to="/approvals"
        />
        <MetricCard
          tone="tangerine"
          label="At-risk deals"
          value={String(openAlerts)}
          sub={openAlerts === 0 ? 'Every deal is healthy' : 'Open alerts on the board'}
          to="/deal-health"
        />
        <MetricCard
          tone="frost"
          label="Open quotations"
          value={String(open.length)}
          sub="Across every stage"
          to="/quotations"
        />
      </div>

      <SectionTitle>Waiting longest for your decision</SectionTitle>
      {myDesk.length === 0 ? (
        <EmptyCard message="Nothing is waiting for your decision — the approval desk is clear." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Customer</Th>
              <Th className="text-right">Total</Th>
              <Th>Risk</Th>
              <Th>Submitted</Th>
            </tr>
          </thead>
          <tbody>
            {myDesk.slice(0, PREVIEW_COUNT).map((row) => (
              <Tr
                key={row.id}
                className="cursor-pointer"
                onClick={() => navigate(`/approvals/${row.id}`)}
              >
                <Td className="font-semibold text-ink">{row.number}</Td>
                <Td>{row.customer.name}</Td>
                <Td numeric>{money(row.totalAmount)}</Td>
                <Td>
                  <RiskBadge level={row.riskLevel} score={Number(row.riskScore).toFixed(2)} />
                </Td>
                <Td className="text-ink-subtle">{date(row.submittedAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <SectionTitle>At-risk deals</SectionTitle>
      {preview.length === 0 ? (
        <EmptyCard message="No open alerts — stalled deals, discount anomalies and delivery slippage will appear here." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Alert</Th>
              <Th>Quotation</Th>
              <Th>Customer</Th>
            </tr>
          </thead>
          <tbody>
            {preview.map((alert) => (
              <Tr
                key={alert.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate(
                    alert.quotation ? `/quotations/${alert.quotation.id}` : '/deal-health',
                  )
                }
              >
                <Td>
                  <span className="flex flex-wrap items-center gap-xs">
                    <Badge variant="neutral">{humanise(alert.type)}</Badge>
                    <span className="text-ink-subtle">{alert.title}</span>
                  </span>
                </Td>
                <Td className="font-semibold text-ink">{alert.quotation?.number ?? '—'}</Td>
                <Td>{alert.quotation?.customer.name ?? '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Finance / Ops: second-level approvals, money outstanding, recurring billing
// and the backorder queue (specs.md §2). Amounts are the API's own — the
// dashboard never adds money up itself.
// ---------------------------------------------------------------------------

function FinanceDashboard({
  approvals,
  invoices,
  invoiceMeta,
  subscriptionMeta,
  openBackorders,
}: {
  approvals: ApprovalListItem[];
  invoices: InvoiceListItem[];
  invoiceMeta: InvoiceListMeta | null;
  subscriptionMeta: SubscriptionListMeta | null;
  openBackorders: number;
}) {
  const navigate = useNavigate();

  const financeDesk = approvals.filter(
    (row) => row.currentStep && String(row.currentStep.level) === 'FINANCE',
  );
  const unpaid = invoiceMeta?.counts.unpaid ?? invoices.length;
  const balance = invoiceMeta?.counts.balanceAmount ?? '0';
  const activeSubs = subscriptionMeta?.counts.active ?? 0;
  const overdue = invoices.filter((row) => String(row.status) === 'OVERDUE');

  return (
    <>
      <div className="grid gap-gutter sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          tone="lemon"
          label="Awaiting finance decision"
          value={String(financeDesk.length)}
          sub={financeDesk.length === 0 ? 'Desk is clear' : 'High-risk discounts need you'}
          to="/approvals"
        />
        <MetricCard
          tone="tangerine"
          label="Outstanding invoices"
          value={String(unpaid)}
          sub={`${money(balance)} still to collect`}
          to="/invoices"
        />
        <MetricCard
          tone="frost"
          label="Active subscriptions"
          value={String(activeSubs)}
          sub="Billing on cycle"
          to="/subscriptions"
        />
        <MetricCard
          tone="obsidian"
          label="Open backorders"
          value={String(openBackorders)}
          sub={openBackorders === 0 ? 'Nothing short' : 'Stock receipts feed this queue'}
          to="/warehouses"
        />
      </div>

      <SectionTitle>Overdue invoices</SectionTitle>
      {overdue.length === 0 ? (
        <EmptyCard message="No overdue invoices — everything issued is paid or still within terms." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Customer</Th>
              <Th>Due</Th>
              <Th className="text-right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            {overdue.slice(0, PREVIEW_COUNT).map((row) => (
              <Tr
                key={row.id}
                className="cursor-pointer"
                onClick={() => navigate(`/invoices/${row.id}`)}
              >
                <Td className="font-semibold text-ink">{row.number}</Td>
                <Td>{row.customer.name}</Td>
                <Td className="text-ink-subtle">{date(row.dueDate)}</Td>
                <Td numeric>{money(row.balanceAmount)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <SectionTitle>Awaiting finance decision</SectionTitle>
      {financeDesk.length === 0 ? (
        <EmptyCard message="Nothing is waiting for finance — no high-risk discount needs a second level." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Customer</Th>
              <Th className="text-right">Total</Th>
              <Th>Risk</Th>
            </tr>
          </thead>
          <tbody>
            {financeDesk
              .slice()
              .sort(bySubmittedAt)
              .slice(0, PREVIEW_COUNT)
              .map((row) => (
                <Tr
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/approvals/${row.id}`)}
                >
                  <Td className="font-semibold text-ink">{row.number}</Td>
                  <Td>{row.customer.name}</Td>
                  <Td numeric>{money(row.totalAmount)}</Td>
                  <Td>
                    <RiskBadge level={row.riskLevel} score={Number(row.riskScore).toFixed(2)} />
                  </Td>
                </Tr>
              ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Admin: the platform at a glance — pipeline, money, attention items and the
// directories only an admin keeps. Aggregates come from /reports/summary,
// which is the read-only aggregation layer, not a second computation.
// ---------------------------------------------------------------------------

function AdminDashboard({
  summary,
  openAlerts,
  customerCount,
  productCount,
  staffCount,
}: {
  summary: ReportSummary | null;
  openAlerts: number;
  customerCount: number;
  productCount: number;
  staffCount: number;
}) {
  return (
    <>
      <div className="grid gap-gutter sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          tone="lemon"
          label="Quotations"
          value={String(summary?.quotations.total ?? 0)}
          sub={`${summary?.value.orderCount ?? 0} confirmed orders`}
          to="/quotations"
        />
        <MetricCard
          tone="obsidian"
          label="Order value"
          value={money(summary?.value.orderTotal ?? '0')}
          sub="Confirmed orders only"
          to="/fulfillment"
        />
        <MetricCard
          tone="tangerine"
          label="Outstanding"
          value={money(summary?.billing.outstandingAmount ?? '0')}
          sub="Still to collect"
          to="/invoices"
        />
        <MetricCard
          tone="frost"
          label="Open alerts"
          value={String(openAlerts)}
          sub={openAlerts === 0 ? 'Every deal is healthy' : 'On the deal-health board'}
          to="/deal-health"
        />
      </div>

      <SectionTitle>Needs attention</SectionTitle>
      <div className="grid gap-gutter sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pending approvals"
          value={String(summary?.approvals.pending ?? 0)}
          sub="Across both levels"
          to="/approvals"
        />
        <MetricCard
          label="Open backorders"
          value={String(summary?.backorders.open ?? 0)}
          sub="Waiting on stock"
          to="/warehouses"
        />
        <MetricCard
          label="Over-limit quotations"
          value={String(summary?.discounts.overLimitQuotations ?? 0)}
          sub="Broke a ceiling"
          to="/reports"
        />
        <MetricCard
          label="Active subscriptions"
          value={String(summary?.subscriptions.active ?? 0)}
          sub="Billing on cycle"
          to="/subscriptions"
        />
      </div>

      <SectionTitle>Platform</SectionTitle>
      <div className="grid gap-gutter sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Customers" value={String(customerCount)} sub="In the book" to="/customers" />
        <MetricCard label="Products" value={String(productCount)} sub="In the catalogue" to="/products" />
        <MetricCard label="Staff users" value={String(staffCount)} sub="Across every role" to="/users" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The page: fetches only what the signed-in role is allowed to read. A rep
// never calls /approvals, /reports or /alerts — the API would refuse them —
// so each role loads its own slice and nothing else.
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { user } = useAuth();

  const [quotations, setQuotations] = useState<QuotationListItem[] | null>(null);
  const [approvals, setApprovals] = useState<ApprovalListItem[] | null>(null);
  const [alerts, setAlerts] = useState<AlertView[] | null>(null);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [invoices, setInvoices] = useState<InvoiceListItem[] | null>(null);
  const [invoiceMeta, setInvoiceMeta] = useState<InvoiceListMeta | null>(null);
  const [subscriptionMeta, setSubscriptionMeta] = useState<SubscriptionListMeta | null>(null);
  const [openBackorders, setOpenBackorders] = useState(0);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      if (!user) return;

      if (user.role === 'SALES_REP') {
        const quotes = await fetchQuotations();
        if (cancelled) return;
        setQuotations(quotes.data ?? []);
        setError(quotes.error);
      } else if (user.role === 'SALES_MANAGER') {
        const [quotes, desk, board] = await Promise.all([
          fetchQuotations(),
          fetchApprovals(),
          fetchAlerts(),
        ]);
        if (cancelled) return;
        setQuotations(quotes.data ?? []);
        setApprovals(desk.data ?? []);
        setAlerts(board.data ?? []);
        setOpenAlerts(board.meta?.total ?? board.data?.length ?? 0);
        setError(quotes.error ?? desk.error ?? board.error);
      } else if (user.role === 'FINANCE') {
        const [desk, bills, subs, backorders] = await Promise.all([
          fetchApprovals(),
          fetchInvoices(),
          fetchSubscriptions(),
          fetchBackorders(),
        ]);
        if (cancelled) return;
        setApprovals(desk.data ?? []);
        setInvoices(bills.data ?? []);
        setInvoiceMeta(bills.meta ?? null);
        setSubscriptionMeta(subs.meta ?? null);
        setOpenBackorders(backorders.meta?.total ?? backorders.data?.length ?? 0);
        setError(desk.error ?? bills.error ?? subs.error ?? backorders.error);
      } else {
        const [report, board, customers, products, staff] = await Promise.all([
          fetchSummary(EMPTY_FILTERS),
          fetchAlerts(),
          fetchCustomers(),
          fetchProducts(),
          fetchUsers(),
        ]);
        if (cancelled) return;
        setSummary(report.data ?? null);
        setAlerts(board.data ?? []);
        setOpenAlerts(board.meta?.total ?? board.data?.length ?? 0);
        setCustomerCount(customers.meta?.total ?? customers.data?.length ?? 0);
        setProductCount(products.meta?.total ?? products.data?.length ?? 0);
        setStaffCount(staff.meta?.total ?? staff.data?.length ?? 0);
        setError(report.error ?? board.error ?? customers.error ?? products.error ?? staff.error);
      }

      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <InternalLayout
      breadcrumb={['DealFlow360']}
      title="Sales Dashboard"
      actions={user ? <Badge variant="dark">{humanise(user.role)}</Badge> : undefined}
    >
      {error && <ErrorCard error={error} />}

      {loading || !user ? (
        <LoadingCard label="Sales dashboard" />
      ) : user.role === 'SALES_REP' ? (
        <RepDashboard quotations={quotations ?? []} userId={user.id} />
      ) : user.role === 'SALES_MANAGER' ? (
        <ManagerDashboard
          quotations={quotations ?? []}
          approvals={approvals ?? []}
          alerts={alerts ?? []}
          openAlerts={openAlerts}
        />
      ) : user.role === 'FINANCE' ? (
        <FinanceDashboard
          approvals={approvals ?? []}
          invoices={invoices ?? []}
          invoiceMeta={invoiceMeta}
          subscriptionMeta={subscriptionMeta}
          openBackorders={openBackorders}
        />
      ) : (
        <AdminDashboard
          summary={summary}
          openAlerts={openAlerts}
          customerCount={customerCount}
          productCount={productCount}
          staffCount={staffCount}
        />
      )}
    </InternalLayout>
  );
}
