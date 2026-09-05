// Screen 5 (specs.md §6): the approver's desk.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, ApprovalCounts, ApprovalListItem } from '@dealflow360/shared';

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
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { fetchApprovals } from '../../../features/approvals/approvals.api';
import { humanise, money } from '../../../lib/format';

export default function ApprovalsList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ApprovalListItem[] | null>(null);
  const [counts, setCounts] = useState<ApprovalCounts | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const response = await fetchApprovals();
    setRows(response.data ?? []);
    setCounts(response.meta?.counts ?? null);
    setError(response.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <InternalLayout breadcrumb={['DealFlow360']} title="Approvals">
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-3">
        <Card tone="lemon">
          <CardLabel>Pending</CardLabel>
          <CardMetric>{counts?.pending ?? '—'}</CardMetric>
        </Card>
        <Card tone="tangerine">
          <CardLabel>Returned</CardLabel>
          <CardMetric>{counts?.returned ?? '—'}</CardMetric>
        </Card>
        <Card>
          <CardLabel>Approved</CardLabel>
          <CardMetric>{counts?.approved ?? '—'}</CardMetric>
        </Card>
      </div>

      <TableShell>
        <TableToolbar>
          <h2 className="text-title-md text-ink">Quotations in the approval flow</h2>
          <Badge variant="neutral">{rows?.length ?? 0} shown</Badge>
        </TableToolbar>

        {rows === null ? (
          <div className="p-lg">
            <LoadingCard label="Approvals" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-lg">
            <EmptyCard message="Nothing is waiting on an approver right now." />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Customer</Th>
                <Th className="text-right">Total</Th>
                <Th>Blended risk</Th>
                <Th>Stage</Th>
                <Th>Current assignee</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id} className="cursor-pointer" onClick={() => navigate(`/approvals/${row.id}`)}>
                  <Td className="font-semibold text-ink">{row.number}</Td>
                  <Td>{row.customer.name}</Td>
                  <Td numeric>{money(row.totalAmount)}</Td>
                  <Td>
                    <RiskBadge level={row.riskLevel} score={Number(row.riskScore).toFixed(2)} />
                  </Td>
                  <Td>
                    <Badge variant="neutral">{humanise(row.status)}</Badge>
                  </Td>
                  <Td className="text-ink-subtle">
                    {row.currentStep
                      ? `${humanise(row.currentStep.level)} · ${row.currentStep.assignee?.fullName ?? 'Unassigned'}`
                      : '—'}
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
