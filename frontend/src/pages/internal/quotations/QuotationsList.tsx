// Screen 3 (specs.md §6): every quotation, grouped by stage.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, QuotationListItem, QuotationStatus } from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Button,
  EmptyCard,
  ErrorCard,
  FilterPill,
  LoadingCard,
  RiskBadge,
  SearchInput,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { DEFAULT_CUSTOMER_ID, SALES_REP } from '../../../config/current-user';
import { createQuotation, fetchQuotations } from '../../../features/quotations/quotations.api';
import { humanise, money } from '../../../lib/format';

/** The stages specs.md §6 groups the list by. */
const STAGES: Array<{ label: string; value: QuotationStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' as QuotationStatus },
  { label: 'Pending Approval', value: 'PENDING_APPROVAL' as QuotationStatus },
  { label: 'Approved', value: 'APPROVED' as QuotationStatus },
  { label: 'Negotiation', value: 'NEGOTIATION' as QuotationStatus },
  { label: 'Confirmed', value: 'CONFIRMED' as QuotationStatus },
];

export default function QuotationsList() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<QuotationStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<QuotationListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (selected: QuotationStatus | 'ALL') => {
    setRows(null);
    setError(null);
    const response = await fetchQuotations(selected === 'ALL' ? undefined : selected);
    setRows(response.data ?? []);
    setTotal(response.meta?.total ?? response.data?.length ?? 0);
    setError(response.error);
  }, []);

  useEffect(() => {
    void load(stage);
  }, [load, stage]);

  async function handleNewQuotation() {
    setCreating(true);
    const response = await createQuotation({
      customerId: DEFAULT_CUSTOMER_ID,
      ownerUserId: SALES_REP.id,
      actorUserId: SALES_REP.id,
      lines: [],
    });
    setCreating(false);

    if (response.data) {
      navigate(`/quotations/${response.data.id}`);
      return;
    }
    setError(response.error);
  }

  // Search is client-side over the loaded page; the stage filter is the one the
  // API applies.
  const term = search.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (row) =>
      term.length === 0 ||
      row.number.toLowerCase().includes(term) ||
      row.customer.name.toLowerCase().includes(term),
  );

  return (
    <InternalLayout
      breadcrumb={['DealFlow360']}
      title="Quotations"
      actions={
        <Button onClick={handleNewQuotation} disabled={creating}>
          {creating ? 'Creating…' : 'New Quotation'}
        </Button>
      }
    >
      {error && <ErrorCard error={error} />}

      <TableShell className={error ? 'mt-lg' : undefined}>
        <TableToolbar>
          <div className="flex flex-wrap items-center gap-xs">
            {STAGES.map((option) => (
              <FilterPill
                key={option.value}
                label="Stage"
                value={option.label}
                active={stage === option.value}
                onClick={() => setStage(option.value)}
              />
            ))}
          </div>
          <div className="flex items-center gap-sm">
            <Badge variant="neutral">{total} total</Badge>
            <SearchInput
              placeholder="Search number or customer"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-[16rem] max-w-full"
            />
          </div>
        </TableToolbar>

        {rows === null ? (
          <div className="p-lg">
            <LoadingCard label="Quotations" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-lg">
            <EmptyCard message="No quotations in this stage yet." />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Customer</Th>
                <Th>Owner</Th>
                <Th className="text-right">Lines</Th>
                <Th className="text-right">Total</Th>
                <Th>Risk</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <Tr
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/quotations/${row.id}`)}
                >
                  <Td className="font-semibold text-ink">{row.number}</Td>
                  <Td>{row.customer.name}</Td>
                  <Td className="text-ink-subtle">{row.ownerUser.fullName}</Td>
                  <Td numeric>{row._count.lines}</Td>
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
      </TableShell>
    </InternalLayout>
  );
}
