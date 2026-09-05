// Screen 13 (specs.md §6): one invoice, its progress, its lines, its payments.
//
// A one-time invoice only exists because a shipment went out, so its timeline
// runs Order Confirmed → Shipped → Invoiced → Paid. A recurring invoice never
// ships: that stage is marked as not applying rather than left looking unmet.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ApiError, InvoiceDetailView, PaymentMethodValue } from '@dealflow360/shared';

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
import { FINANCE } from '../../../config/current-user';
import { fetchInvoice, recordPayment } from '../../../features/invoices/invoices.api';
import { date, dateTime, humanise, money } from '../../../lib/format';
import { ProgressTimeline } from './components/ProgressTimeline';
import type { TimelineStage } from './components/ProgressTimeline';

const PAYMENT_METHODS: PaymentMethodValue[] = ['BANK_TRANSFER', 'CARD', 'CHECK', 'CASH', 'GATEWAY'];

/** An order that has shipped something is what lets a one-time invoice exist. */
const SHIPPED_ORDER_STATUS = ['PARTIALLY_FULFILLED', 'FULFILLED'];

function statusVariant(status: string) {
  if (status === 'PAID') return 'info' as const;
  if (status === 'PARTIALLY_PAID') return 'primary' as const;
  if (status === 'OVERDUE' || status === 'VOID') return 'critical' as const;
  return 'neutral' as const;
}

/** Builds the four stages from what the API actually reported. */
function buildStages(invoice: InvoiceDetailView): TimelineStage[] {
  const order = invoice.salesOrder;
  const recurring = invoice.type === 'RECURRING';
  const shipped = order !== null && SHIPPED_ORDER_STATUS.includes(order.status);
  const paid = invoice.status === 'PAID';
  const partiallyPaid = Number(invoice.paidAmount) > 0 && !paid;

  return [
    {
      label: 'Order Confirmed',
      state: order ? 'done' : 'skipped',
      detail: order ? `${order.number} · ${humanise(order.status)}` : 'No sales order on this invoice',
    },
    {
      label: 'Shipped',
      state: recurring ? 'skipped' : shipped ? 'done' : 'pending',
      detail: recurring
        ? 'Recurring lines bill on schedule, they do not ship'
        : shipped
          ? 'Stock left the warehouse — only shipped quantities are billed here'
          : 'Nothing has shipped yet',
    },
    {
      label: 'Invoiced',
      state: 'done',
      detail: `${invoice.number} issued ${date(invoice.issueDate)}`,
    },
    {
      label: 'Paid',
      state: paid ? 'done' : partiallyPaid ? 'current' : 'pending',
      detail: paid
        ? `Settled in full · ${money(invoice.paidAmount)}`
        : partiallyPaid
          ? `${money(invoice.paidAmount)} received, ${money(invoice.balanceAmount)} outstanding`
          : `${money(invoice.balanceAmount)} due ${date(invoice.dueDate)}`,
    },
  ];
}

export default function InvoiceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<InvoiceDetailView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethodValue>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetchInvoice(id);
    setInvoice(response.data);
    setError(response.error);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function openPaymentForm() {
    if (!invoice) return;
    setAmount(invoice.balanceAmount);
    setReference('');
    setNotice(null);
    setError(null);
    setPaying(true);
  }

  async function submitPayment() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError({ code: 'VALIDATION_ERROR', message: 'Enter a payment amount greater than zero' });
      return;
    }

    setBusy(true);
    const response = await recordPayment(id, {
      actorUserId: FINANCE.id,
      amount: value,
      method,
      reference: reference.trim() || null,
    });
    setBusy(false);

    if (!response.data) {
      // The backend refuses an overpayment; its message is what the user sees.
      setError(response.error);
      return;
    }

    setInvoice(response.data);
    setError(null);
    setPaying(false);
    setNotice(
      response.data.status === 'PAID'
        ? `Payment of ${money(value)} recorded — invoice settled in full.`
        : `Payment of ${money(value)} recorded — ${money(response.data.balanceAmount)} still outstanding.`,
    );
  }

  if (error && !invoice) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Invoices']} title="Invoice">
        <ErrorCard error={error} />
      </InternalLayout>
    );
  }

  if (!invoice) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Invoices']} title="Invoice">
        <LoadingCard label="Invoice" />
      </InternalLayout>
    );
  }

  const settled = Number(invoice.balanceAmount) <= 0;
  const paymentCount = invoice.payments.length;

  return (
    <InternalLayout
      breadcrumb={['DealFlow360', 'Invoices', invoice.number]}
      title={`${invoice.number} — ${invoice.customer.name}`}
      actions={
        <>
          <Badge variant={invoice.type === 'RECURRING' ? 'dark' : 'neutral'}>{humanise(invoice.type)}</Badge>
          <Badge variant={statusVariant(invoice.status)}>{humanise(invoice.status)}</Badge>
          {paying ? (
            <>
              <Button variant="ghost" onClick={() => setPaying(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submitPayment} disabled={busy}>
                {busy ? 'Working…' : 'Save Payment'}
              </Button>
            </>
          ) : (
            !settled && <Button onClick={openPaymentForm}>Record Payment</Button>
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
          <CardLabel>Invoice total</CardLabel>
          <CardMetric>{money(invoice.totalAmount)}</CardMetric>
          <p className="text-body-sm text-obsidian-muted">
            {invoice.lines.length} lines · issued {date(invoice.issueDate)}
          </p>
        </Card>
        <Card tone={settled ? 'lemon' : 'tangerine'}>
          <CardLabel>Balance</CardLabel>
          <CardMetric>{money(invoice.balanceAmount)}</CardMetric>
          <p className="text-body-sm opacity-80">
            {settled ? 'Settled in full' : `due ${date(invoice.dueDate)}`}
          </p>
        </Card>
        <Card>
          <CardLabel>Paid</CardLabel>
          <CardMetric>{money(invoice.paidAmount)}</CardMetric>
          <p className="text-body-sm text-ink-subtle">
            {paymentCount === 1 ? '1 payment recorded' : `${paymentCount} payments recorded`}
          </p>
        </Card>
        <Card>
          <CardLabel>{invoice.type === 'RECURRING' ? 'Billing period' : 'Billed against'}</CardLabel>
          <p className="mt-xs text-title-md text-ink">
            {invoice.type === 'RECURRING'
              ? `${date(invoice.periodStart)} → ${date(invoice.periodEnd)}`
              : 'Shipped quantities only'}
          </p>
          {invoice.subscription ? (
            <Button
              variant="ghost"
              className="mt-sm"
              onClick={() => navigate(`/subscriptions/${invoice.subscription?.id}`)}
            >
              {invoice.subscription.subscriptionPlan.name}
            </Button>
          ) : (
            invoice.salesOrder && (
              <Button
                variant="ghost"
                className="mt-sm"
                onClick={() => navigate(`/fulfillment/${invoice.salesOrder?.id}`)}
              >
                From {invoice.salesOrder.number}
              </Button>
            )
          )}
        </Card>
      </div>

      <Card className="mb-lg">
        <CardLabel>Progress</CardLabel>
        <div className="mt-md">
          <ProgressTimeline stages={buildStages(invoice)} />
        </div>
      </Card>

      {paying && (
        <Card className="mb-lg">
          <CardLabel>Record payment</CardLabel>
          <p className="mt-xs text-body-sm text-ink-subtle">
            Recorded as {FINANCE.fullName}. A payment larger than the {money(invoice.balanceAmount)} outstanding
            is refused by the API.
          </p>
          <div className="mt-md flex flex-wrap items-end gap-md">
            <label className="flex flex-col gap-2xs">
              <span className="text-label-md text-ink-subtle">Amount</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="frost-input tabular w-40 rounded-full px-md py-[0.4rem] text-right text-body-md
                  focus:outline-none focus:ring-2 focus:ring-lemon/60"
              />
            </label>
            <label className="flex flex-col gap-2xs">
              <span className="text-label-md text-ink-subtle">Method</span>
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethodValue)}
                className="frost-input rounded-full px-md py-[0.45rem] text-body-md
                  focus:outline-none focus:ring-2 focus:ring-lemon/60"
              >
                {PAYMENT_METHODS.map((option) => (
                  <option key={option} value={option}>
                    {humanise(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-2xs">
              <span className="text-label-md text-ink-subtle">Reference (optional)</span>
              <input
                type="text"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="UTR / cheque number"
                className="frost-input w-full rounded-full px-md py-[0.4rem] text-body-md
                  placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60"
              />
            </label>
          </div>
        </Card>
      )}

      <TableShell className="mb-lg">
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Invoice lines</h2>
            <p className="text-body-sm text-ink-subtle">
              {invoice.type === 'RECURRING'
                ? 'One line per subscription period billed.'
                : 'Quantities as shipped — a backordered quantity is not on this invoice.'}
            </p>
          </div>
          <Badge variant="neutral">{money(invoice.subtotalAmount)} subtotal</Badge>
        </TableToolbar>

        <Table>
          <thead>
            <tr>
              <Th>Description</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Unit price</Th>
              <Th className="text-right">Discount</Th>
              <Th className="text-right">Line total</Th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <Tr key={line.id}>
                <Td>
                  <span className="block text-ink">{line.description}</span>
                  {line.periodStart && (
                    <span className="block text-label-md text-ink-subtle">
                      {date(line.periodStart)} → {date(line.periodEnd)}
                    </span>
                  )}
                </Td>
                <Td numeric>{Number(line.quantity)}</Td>
                <Td numeric>{money(line.unitPrice)}</Td>
                <Td numeric>{Number(line.discountPct)}%</Td>
                <Td numeric>{money(line.lineTotal)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableShell>

      <div className="grid gap-gutter lg:grid-cols-2">
        <Card>
          <CardLabel>Payments</CardLabel>
          {invoice.payments.length === 0 ? (
            <p className="mt-sm text-body-md text-ink-subtle">
              No payments recorded yet — use Record Payment above.
            </p>
          ) : (
            <ul className="mt-md flex flex-col gap-sm">
              {invoice.payments.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center gap-sm">
                  <span className="tabular text-title-sm text-ink">{money(payment.amount)}</span>
                  <Badge variant="neutral">{humanise(payment.method)}</Badge>
                  <Badge variant={payment.status === 'COMPLETED' ? 'info' : 'neutral'}>
                    {humanise(payment.status)}
                  </Badge>
                  <span className="text-body-sm text-ink-subtle">{dateTime(payment.paidAt)}</span>
                  {payment.reference && (
                    <span className="text-body-sm text-ink-subtle">ref {payment.reference}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardLabel>Credit notes</CardLabel>
          {invoice.creditNotes.length === 0 ? (
            <p className="mt-sm text-body-md text-ink-subtle">No credit notes against this invoice.</p>
          ) : (
            <ul className="mt-md flex flex-col gap-sm">
              {invoice.creditNotes.map((note) => (
                <li key={note.id} className="flex flex-wrap items-center gap-sm">
                  <span className="text-title-sm text-ink">{note.number}</span>
                  <span className="tabular text-body-md text-ink-body">{money(note.amount)}</span>
                  <Badge variant="critical">{humanise(note.reason)}</Badge>
                  <Badge variant="neutral">{humanise(note.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </InternalLayout>
  );
}
