// Screen 12 (specs.md §6): every invoice raised, one-time and recurring alike.
//
// The Unpaid / Paid counts and the money totals come from GET /invoices meta —
// this screen never sums anything itself.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, InvoiceListItem, InvoiceListMeta } from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Card,
  CardLabel,
  CardMetric,
  EmptyCard,
  ErrorCard,
  FilterChip,
  FilterChipGroup,
  LoadingCard,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { fetchInvoices } from '../../../features/invoices/invoices.api';
import { date, humanise, money } from '../../../lib/format';

const TYPE_FILTERS = [
  { label: 'All', value: '' },
  { label: 'One-time', value: 'ONE_TIME' },
  { label: 'Recurring', value: 'RECURRING' },
] as const;

/** Paid is settled, an outstanding balance is not — the badge says which. */
function statusVariant(status: string) {
  if (status === 'PAID') return 'info' as const;
  if (status === 'PARTIALLY_PAID') return 'primary' as const;
  if (status === 'OVERDUE' || status === 'VOID') return 'critical' as const;
  return 'neutral' as const;
}

export default function InvoicesList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<InvoiceListItem[] | null>(null);
  const [meta, setMeta] = useState<InvoiceListMeta | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [type, setType] = useState<string>('');

  const load = useCallback(async () => {
    setRows(null);
    const response = await fetchInvoices(type || undefined);
    setRows(response.data ?? []);
    setMeta(response.meta ?? null);
    setError(response.error);
  }, [type]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = meta?.counts;

  return (
    <InternalLayout breadcrumb={['DealFlow360']} title="Invoices">
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-2 xl:grid-cols-4">
        <Card tone="obsidian">
          <CardLabel>Unpaid</CardLabel>
          <CardMetric>{counts ? counts.unpaid : '—'}</CardMetric>
          <p className="text-body-sm text-obsidian-muted">invoices with a balance left to settle</p>
        </Card>
        <Card tone="lemon">
          <CardLabel>Paid</CardLabel>
          <CardMetric>{counts ? counts.paid : '—'}</CardMetric>
          <p className="text-body-sm opacity-80">fully settled</p>
        </Card>
        <Card>
          <CardLabel>Invoiced</CardLabel>
          <CardMetric>{counts ? money(counts.totalAmount) : '—'}</CardMetric>
          <p className="text-body-sm text-ink-subtle">billed across every invoice</p>
        </Card>
        <Card tone={counts && Number(counts.balanceAmount) > 0 ? 'tangerine' : 'frost'}>
          <CardLabel>Outstanding</CardLabel>
          <CardMetric>{counts ? money(counts.balanceAmount) : '—'}</CardMetric>
          <p className="text-body-sm opacity-80">
            {counts ? `${money(counts.paidAmount)} received` : 'awaiting payment'}
          </p>
        </Card>
      </div>

      <TableShell>
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">All invoices</h2>
            <p className="text-body-sm text-ink-subtle">
              One-time invoices bill what shipped; recurring invoices bill a subscription period.
            </p>
          </div>
          <FilterChipGroup label="Type">
            {TYPE_FILTERS.map((filter) => (
              <FilterChip
                key={filter.label}
                active={type === filter.value}
                onClick={() => setType(filter.value)}
              >
                {filter.label}
              </FilterChip>
            ))}
          </FilterChipGroup>
        </TableToolbar>

        {rows === null ? (
          <div className="p-lg">
            <LoadingCard label="Invoices" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-lg">
            <EmptyCard
              message={
                type
                  ? `No ${humanise(type).toLowerCase()} invoices yet.`
                  : 'No invoices yet — ship a confirmed order, or bill a subscription period, to raise one.'
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Customer / Order</Th>
                <Th>Type</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Balance</Th>
                <Th>Due</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${row.id}`)}>
                  <Td className="font-semibold text-ink">
                    <span className="block">{row.number}</span>
                    <span className="block text-label-md font-normal text-ink-subtle">
                      {row._count.lines} lines · {row._count.payments} payments
                    </span>
                  </Td>
                  <Td>
                    <span className="block text-ink">{row.customer.name}</span>
                    <span className="block text-label-md text-ink-subtle">
                      {row.salesOrder ? row.salesOrder.number : 'No sales order'}
                      {row.subscription ? ` · ${row.subscription.subscriptionPlan.name}` : ''}
                    </span>
                  </Td>
                  <Td>
                    <Badge variant={row.type === 'RECURRING' ? 'dark' : 'neutral'}>
                      {humanise(row.type)}
                    </Badge>
                  </Td>
                  <Td numeric>{money(row.totalAmount)}</Td>
                  <Td numeric className={Number(row.balanceAmount) > 0 ? 'text-ink' : 'text-ink-subtle'}>
                    {money(row.balanceAmount)}
                  </Td>
                  <Td>{date(row.dueDate)}</Td>
                  <Td>
                    <Badge variant={statusVariant(row.status)}>{humanise(row.status)}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableShell>
    </InternalLayout>
  );
}
