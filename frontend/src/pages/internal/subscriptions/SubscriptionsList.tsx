// Screen 9 (specs.md §6): every recurring plan across customers.
//
// A subscription is created by confirming an order that carries a recurring
// line, so this list is the other half of what the confirm step produced.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, SubscriptionListItem, SubscriptionListMeta } from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Card,
  CardLabel,
  CardMetric,
  EmptyCard,
  ErrorCard,
  FilterPill,
  LoadingCard,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { fetchSubscriptions } from '../../../features/subscriptions/subscriptions.api';
import { date, humanise, money } from '../../../lib/format';

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Paused', value: 'PAUSED' },
  { label: 'Cancelled', value: 'CANCELLED' },
] as const;

function statusVariant(status: string) {
  if (status === 'ACTIVE') return 'info' as const;
  if (status === 'PAUSED') return 'primary' as const;
  return 'critical' as const;
}

export default function SubscriptionsList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SubscriptionListItem[] | null>(null);
  const [meta, setMeta] = useState<SubscriptionListMeta | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<string>('');

  const load = useCallback(async () => {
    setRows(null);
    const response = await fetchSubscriptions(status || undefined);
    setRows(response.data ?? []);
    setMeta(response.meta ?? null);
    setError(response.error);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = meta?.counts;

  return (
    <InternalLayout breadcrumb={['DealFlow360']} title="Subscriptions">
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-3">
        <Card tone="obsidian">
          <CardLabel>Active</CardLabel>
          <CardMetric>{counts ? counts.active : '—'}</CardMetric>
          <p className="text-body-sm text-obsidian-muted">billing on their cycle</p>
        </Card>
        <Card>
          <CardLabel>Paused</CardLabel>
          <CardMetric>{counts ? counts.paused : '—'}</CardMetric>
          <p className="text-body-sm text-ink-subtle">no invoice raised while paused</p>
        </Card>
        <Card tone={counts && counts.cancelled > 0 ? 'tangerine' : 'frost'}>
          <CardLabel>Cancelled</CardLabel>
          <CardMetric>{counts ? counts.cancelled : '—'}</CardMetric>
          <p className="text-body-sm opacity-80">unused days credited on cancellation</p>
        </Card>
      </div>

      <TableShell>
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">All subscriptions</h2>
            <p className="text-body-sm text-ink-subtle">
              Open one to bill its period, change its terms, or cancel it.
            </p>
          </div>
          <FilterPill
            label="Status"
            value={status}
            neutralValue=""
            options={STATUS_FILTERS.map((filter) => ({ value: filter.value, label: filter.label }))}
            onChange={setStatus}
          />
        </TableToolbar>

        {rows === null ? (
          <div className="p-lg">
            <LoadingCard label="Subscriptions" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-lg">
            <EmptyCard
              message={
                status
                  ? `No ${humanise(status).toLowerCase()} subscriptions.`
                  : 'No subscriptions yet — confirm an order with a recurring line to create one.'
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th>Customer</Th>
                <Th>Cycle</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Recurring</Th>
                <Th>Next billing</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/subscriptions/${row.id}`)}
                >
                  <Td className="font-semibold text-ink">
                    <span className="block">{row.subscriptionPlan.name}</span>
                    <span className="block text-label-md font-normal text-ink-subtle">
                      {row.subscriptionPlan.code}
                      {row.salesOrder ? ` · ${row.salesOrder.number}` : ''}
                    </span>
                  </Td>
                  <Td>{row.customer.name}</Td>
                  <Td>
                    <Badge variant="neutral">{humanise(row.billingCycle)}</Badge>
                  </Td>
                  <Td numeric>{Number(row.quantity)}</Td>
                  <Td numeric>{money(row.recurringAmount)}</Td>
                  <Td>{date(row.nextBillingDate)}</Td>
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
