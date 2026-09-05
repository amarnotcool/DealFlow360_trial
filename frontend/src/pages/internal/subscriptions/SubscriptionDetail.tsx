// Screen 9's detail, with screen 10 (Billing Detail) merged into it.
//
// specs.md screen 10 asks for one order's one-time and recurring billing shown
// separately. A subscription always belongs to a sales order, so rather than a
// second screen those two streams are loaded here from GET /orders/:id/billing
// and rendered as two labelled sections.
//
// Every prorated amount on this screen was produced by the proration engine and
// stored as a proration_event — nothing here recomputes it.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  ApiError,
  InvoiceWithLinesView,
  OrderBillingView,
  ProrationEventView,
  SubscriptionDetailView,
  SubscriptionPlanView,
} from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  ErrorCard,
  LoadingCard,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { fetchOrderBilling } from '../../../features/invoices/invoices.api';
import {
  cancelSubscription,
  changeSubscription,
  fetchSubscription,
  fetchSubscriptionPlans,
  generateSubscriptionInvoice,
} from '../../../features/subscriptions/subscriptions.api';
import { date, humanise, money } from '../../../lib/format';

function statusVariant(status: string) {
  if (status === 'ACTIVE') return 'info' as const;
  if (status === 'PAUSED') return 'primary' as const;
  return 'critical' as const;
}

function scheduleVariant(status: string) {
  if (status === 'INVOICED') return 'info' as const;
  if (status === 'SCHEDULED') return 'neutral' as const;
  return 'critical' as const;
}

/** A charge is owed by the customer, a credit is owed back to them. */
function direction(event: ProrationEventView): 'CHARGE' | 'CREDIT' | 'NONE' {
  const amount = Number(event.proratedAmount);
  if (amount > 0) return 'CHARGE';
  if (amount < 0) return 'CREDIT';
  return 'NONE';
}

function InvoiceStream({
  title,
  description,
  invoices,
  emptyMessage,
  onOpen,
}: {
  title: string;
  description: string;
  invoices: InvoiceWithLinesView[];
  emptyMessage: string;
  onOpen: (invoiceId: string) => void;
}) {
  return (
    <Card>
      <CardLabel>{title}</CardLabel>
      <p className="mt-2xs text-body-sm text-ink-subtle">{description}</p>

      {invoices.length === 0 ? (
        <p className="mt-md text-body-md text-ink-subtle">{emptyMessage}</p>
      ) : (
        <ul className="mt-md flex flex-col gap-sm">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <button
                type="button"
                onClick={() => onOpen(invoice.id)}
                className="flex w-full flex-wrap items-center gap-sm rounded-md px-sm py-xs text-left
                  transition-colors hover:bg-white/60"
              >
                <span className="text-title-sm text-ink">{invoice.number}</span>
                <span className="tabular text-body-md text-ink-body">{money(invoice.totalAmount)}</span>
                <Badge variant={invoice.status === 'PAID' ? 'info' : 'neutral'}>
                  {humanise(invoice.status)}
                </Badge>
                <span className="text-body-sm text-ink-subtle">
                  {invoice.periodStart
                    ? `${date(invoice.periodStart)} → ${date(invoice.periodEnd)}`
                    : `${invoice.lines.length} lines · issued ${date(invoice.issueDate)}`}
                </span>
                {Number(invoice.balanceAmount) > 0 && (
                  <span className="tabular text-body-sm text-ink-subtle">
                    {money(invoice.balanceAmount)} outstanding
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function SubscriptionDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [subscription, setSubscription] = useState<SubscriptionDetailView | null>(null);
  const [billing, setBilling] = useState<OrderBillingView | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanView[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [planId, setPlanId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const detail = await fetchSubscription(id);
    setSubscription(detail.data);
    setError(detail.error);

    if (detail.data?.salesOrder) {
      const stream = await fetchOrderBilling(detail.data.salesOrder.id);
      setBilling(stream.data);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchSubscriptionPlans().then((response) => setPlans(response.data ?? []));
  }, []);

  /** Reloads both the subscription and the order's billing after a write. */
  async function refresh(data: SubscriptionDetailView, message: string) {
    setSubscription(data);
    setError(null);
    setNotice(message);
    setChanging(false);
    setCancelling(false);
    await load();
  }

  function openChangeForm() {
    if (!subscription) return;
    setPlanId(subscription.subscriptionPlan.id);
    setQuantity(String(Number(subscription.quantity)));
    setNotice(null);
    setError(null);
    setCancelling(false);
    setChanging(true);
  }

  async function submitChange() {
    if (!subscription) return;

    const nextQuantity = Number(quantity);
    if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
      setError({ code: 'VALIDATION_ERROR', message: 'Enter a quantity greater than zero' });
      return;
    }

    setBusy(true);
    const response = await changeSubscription(id, {
      subscriptionPlanId: planId || null,
      quantity: nextQuantity,
    });
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    const event = response.data.prorationEvents[0];
    await refresh(
      response.data,
      event
        ? `${humanise(event.type)} priced by the proration engine — ${money(event.proratedAmount)} (${direction(event)}).`
        : 'Subscription changed.',
    );
  }

  async function submitCancel() {
    setBusy(true);
    const response = await cancelSubscription(id, { reason: reason.trim() || null });
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    const event = response.data.prorationEvents[0];
    setReason('');
    await refresh(
      response.data,
      event
        ? `Cancelled — ${money(event.creditAmount)} credited for the unused part of the cycle.`
        : 'Subscription cancelled.',
    );
  }

  async function generateInvoice() {
    setBusy(true);
    const response = await generateSubscriptionInvoice(id);
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    setNotice(
      `${response.data.number} raised for ${date(response.data.periodStart)} → ${date(response.data.periodEnd)} · ${money(response.data.totalAmount)}. Next period scheduled.`,
    );
    setError(null);
    await load();
  }

  if (error && !subscription) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Subscriptions']} title="Subscription">
        <ErrorCard error={error} />
      </InternalLayout>
    );
  }

  if (!subscription) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Subscriptions']} title="Subscription">
        <LoadingCard label="Subscription" />
      </InternalLayout>
    );
  }

  const cancelled = subscription.status === 'CANCELLED';
  const latestEvent = subscription.prorationEvents[0] ?? null;
  const latestCredit = latestEvent
    ? subscription.creditNotes.find((note) => note.prorationEventId === latestEvent.id)
    : undefined;

  return (
    <InternalLayout
      breadcrumb={['DealFlow360', 'Subscriptions', subscription.subscriptionPlan.code]}
      title={`${subscription.subscriptionPlan.name} — ${subscription.customer.name}`}
      actions={
        <>
          <Badge variant={statusVariant(subscription.status)}>{humanise(subscription.status)}</Badge>
          {cancelled ? null : changing ? (
            <>
              <Button variant="ghost" onClick={() => setChanging(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submitChange} disabled={busy}>
                {busy ? 'Working…' : 'Apply Change'}
              </Button>
            </>
          ) : cancelling ? (
            <>
              <Button variant="ghost" onClick={() => setCancelling(false)} disabled={busy}>
                Keep Subscription
              </Button>
              <Button onClick={submitCancel} disabled={busy}>
                {busy ? 'Working…' : 'Confirm Cancellation'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setCancelling(true)} disabled={busy}>
                Cancel Subscription
              </Button>
              <Button variant="secondary" onClick={generateInvoice} disabled={busy}>
                {busy ? 'Working…' : 'Generate Invoice'}
              </Button>
              <Button onClick={openChangeForm} disabled={busy}>
                Change Plan / Quantity
              </Button>
            </>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      {notice && (
        <Card tone="lemon" className="mb-lg">
          <CardLabel>Done</CardLabel>
          <p className="mt-xs text-title-md">{notice}</p>
        </Card>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-2 xl:grid-cols-4">
        <Card tone="obsidian">
          <CardLabel>Recurring amount</CardLabel>
          <CardMetric>{money(subscription.recurringAmount)}</CardMetric>
          <p className="text-body-sm text-obsidian-muted">
            {Number(subscription.quantity)} × {money(subscription.unitPrice)} per{' '}
            {subscription.billingCycle.toLowerCase()} cycle
          </p>
        </Card>
        <Card tone={cancelled ? 'tangerine' : 'frost'}>
          <CardLabel>Next billing</CardLabel>
          <p className="mt-xs text-headline-lg text-ink">
            {cancelled ? 'Cancelled' : date(subscription.nextBillingDate)}
          </p>
          <p className="text-body-sm opacity-80">
            {cancelled
              ? `on ${date(subscription.cancelledAt)}`
              : `started ${date(subscription.startDate)}`}
          </p>
        </Card>
        <Card>
          <CardLabel>Plan</CardLabel>
          <p className="mt-xs text-title-md text-ink">{subscription.subscriptionPlan.name}</p>
          <p className="text-body-sm text-ink-subtle">
            {subscription.subscriptionPlan.code} · list {money(subscription.subscriptionPlan.recurringPrice)}
          </p>
        </Card>
        <Card>
          <CardLabel>Sales order</CardLabel>
          {subscription.salesOrder ? (
            <>
              <p className="mt-xs text-title-md text-ink">{subscription.salesOrder.number}</p>
              <Button
                variant="ghost"
                className="mt-sm"
                onClick={() => navigate(`/fulfillment/${subscription.salesOrder?.id}`)}
              >
                Open order
              </Button>
            </>
          ) : (
            <p className="mt-sm text-body-md text-ink-subtle">
              Not linked to a sales order.
            </p>
          )}
        </Card>
      </div>

      {changing && (
        <Card className="mb-lg">
          <CardLabel>Change plan or quantity</CardLabel>
          <p className="mt-xs text-body-sm text-ink-subtle">
            The proration engine prices the days left in the current cycle. A downgrade or a
            cancellation raises a credit note; an upgrade is charged.
          </p>
          <div className="mt-md flex flex-wrap items-end gap-md">
            <label className="flex flex-col gap-2xs">
              <span className="text-label-md text-ink-subtle">Plan</span>
              <select
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className="frost-input rounded-full px-md py-[0.45rem] text-body-md
                  focus:outline-none focus:ring-2 focus:ring-lemon/60"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {money(plan.recurringPrice)} / {plan.billingCycle.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2xs">
              <span className="text-label-md text-ink-subtle">Quantity</span>
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="frost-input tabular w-28 rounded-full px-md py-[0.4rem] text-right text-body-md
                  focus:outline-none focus:ring-2 focus:ring-lemon/60"
              />
            </label>
          </div>
        </Card>
      )}

      {cancelling && (
        <Card className="mb-lg" tone="tangerine">
          <CardLabel>Cancel subscription</CardLabel>
          <p className="mt-xs text-body-sm">
            The unused part of the current cycle is credited back as a credit note, priced by the
            proration engine. This cannot be undone.
          </p>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="Why is this subscription being cancelled?"
            className="frost-input mt-sm w-full rounded-md px-md py-sm text-body-md text-ink-body
              placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60"
          />
        </Card>
      )}

      {latestEvent && (
        <Card className="mb-lg">
          <div className="flex flex-wrap items-center gap-sm">
            <CardLabel>Latest proration</CardLabel>
            <Badge variant="dark">{humanise(latestEvent.type)}</Badge>
            <Badge variant={direction(latestEvent) === 'CREDIT' ? 'critical' : 'primary'}>
              {direction(latestEvent)}
            </Badge>
          </div>
          <CardMetric className="mt-xs">{money(latestEvent.proratedAmount)}</CardMetric>
          <p className="text-body-md text-ink-body">{latestEvent.notes ?? 'Priced mid-cycle.'}</p>
          <p className="mt-xs text-body-sm text-ink-subtle">
            {Number(latestEvent.previousQuantity)} × {money(latestEvent.previousUnitPrice)} →{' '}
            {Number(latestEvent.newQuantity)} × {money(latestEvent.newUnitPrice)} · effective{' '}
            {date(latestEvent.effectiveDate)}
          </p>
          {latestCredit && (
            <p className="mt-sm text-body-md text-ink">
              Credit note {latestCredit.number} for {money(latestCredit.amount)} —{' '}
              {humanise(latestCredit.reason)} · {humanise(latestCredit.status)}
            </p>
          )}
        </Card>
      )}

      <div className="mb-lg grid gap-gutter lg:grid-cols-2">
        <InvoiceStream
          title="One-time billing"
          description="Raised when stock shipped on this order."
          invoices={billing?.oneTimeInvoices ?? []}
          emptyMessage={
            billing
              ? 'No one-time invoice yet — nothing on this order has shipped.'
              : 'No sales order, so no one-time billing.'
          }
          onOpen={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
        />
        <InvoiceStream
          title="Recurring billing"
          description="Raised per subscription period on this order."
          invoices={billing?.recurringInvoices ?? []}
          emptyMessage={
            billing
              ? 'No recurring invoice yet — use Generate Invoice to bill the open period.'
              : 'No sales order, so no recurring billing.'
          }
          onOpen={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
        />
      </div>

      <TableShell className="mb-lg">
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Proration events</h2>
            <p className="text-body-sm text-ink-subtle">
              Every mid-cycle change, as the engine priced it.
            </p>
          </div>
          <Badge variant="neutral">{subscription.prorationEvents.length} recorded</Badge>
        </TableToolbar>

        {subscription.prorationEvents.length === 0 ? (
          <div className="px-lg pb-lg">
            <p className="text-body-md text-ink-subtle">
              No proration events yet — a plan or quantity change will appear here.
            </p>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Change</Th>
                <Th>Effective</Th>
                <Th>From → to</Th>
                <Th className="text-right">Prorated</Th>
                <Th className="text-right">Credit</Th>
                <Th>Basis</Th>
              </tr>
            </thead>
            <tbody>
              {subscription.prorationEvents.map((event) => (
                <Tr key={event.id}>
                  <Td>
                    <Badge variant="dark">{humanise(event.type)}</Badge>
                  </Td>
                  <Td>{date(event.effectiveDate)}</Td>
                  <Td>
                    {Number(event.previousQuantity)} × {money(event.previousUnitPrice)} →{' '}
                    {Number(event.newQuantity)} × {money(event.newUnitPrice)}
                  </Td>
                  <Td numeric>{money(event.proratedAmount)}</Td>
                  <Td numeric>{money(event.creditAmount)}</Td>
                  <Td className="text-body-sm text-ink-subtle">{event.notes ?? '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableShell>

      <div className="grid gap-gutter lg:grid-cols-2">
        <Card>
          <CardLabel>Billing schedule</CardLabel>
          {subscription.billingSchedules.length === 0 ? (
            <p className="mt-sm text-body-md text-ink-subtle">No billing period scheduled.</p>
          ) : (
            <ul className="mt-md flex flex-col gap-sm">
              {subscription.billingSchedules.map((schedule) => (
                <li key={schedule.id} className="flex flex-wrap items-center gap-sm">
                  <Badge variant={scheduleVariant(schedule.status)}>{humanise(schedule.status)}</Badge>
                  <span className="tabular text-body-md text-ink-body">
                    {date(schedule.periodStart)} → {date(schedule.periodEnd)}
                  </span>
                  <span className="tabular text-title-sm text-ink">{money(schedule.amount)}</span>
                  <span className="text-body-sm text-ink-subtle">due {date(schedule.dueDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardLabel>Credit notes</CardLabel>
          {subscription.creditNotes.length === 0 ? (
            <p className="mt-sm text-body-md text-ink-subtle">
              No credit notes — a downgrade or a cancellation raises one.
            </p>
          ) : (
            <ul className="mt-md flex flex-col gap-sm">
              {subscription.creditNotes.map((note) => (
                <li key={note.id} className="flex flex-wrap items-center gap-sm">
                  <span className="text-title-sm text-ink">{note.number}</span>
                  <span className="tabular text-body-md text-ink-body">{money(note.amount)}</span>
                  <Badge variant="critical">{humanise(note.reason)}</Badge>
                  <Badge variant="neutral">{humanise(note.status)}</Badge>
                  <span className="text-body-sm text-ink-subtle">{date(note.issuedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </InternalLayout>
  );
}
