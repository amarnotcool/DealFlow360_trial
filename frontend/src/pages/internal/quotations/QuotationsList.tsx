// Screen 3 (specs.md §6): every quotation, grouped by stage.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  ApiError,
  CustomerListItem,
  QuotationListItem,
  QuotationStatus,
} from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  EmptyCard,
  ErrorCard,
  FIELD_CLASS,
  FilterPill,
  type FilterOption,
  LabelledField,
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
import { fetchCustomers } from '../../../features/customers/customers.api';
import { createQuotation, fetchQuotations } from '../../../features/quotations/quotations.api';
import { humanise, money, percent } from '../../../lib/format';

/** The stages specs.md §6 groups the list by, as the Stage dropdown's options. */
const STAGES: Array<FilterOption<QuotationStatus | 'ALL'>> = [
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

  // A new draft has to be raised against a customer, so the button opens the
  // picker rather than assuming one.
  const [picking, setPicking] = useState(false);
  const [customers, setCustomers] = useState<CustomerListItem[] | null>(null);
  const [customerId, setCustomerId] = useState('');

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

  function openPicker() {
    setPicking((open) => !open);
    setError(null);

    if (customers === null) {
      void fetchCustomers().then((response) => {
        setCustomers(response.data ?? []);
        setError(response.error);
      });
    }
  }

  async function handleNewQuotation() {
    if (!customerId) return;

    setCreating(true);
    const response = await createQuotation({ customerId, lines: [] });
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
        <Button onClick={openPicker}>{picking ? 'Close' : 'New Quotation'}</Button>
      }
    >
      {error && <ErrorCard error={error} />}

      {picking && (
        <Card className={error ? 'mt-lg' : undefined}>
          <CardLabel>New quotation</CardLabel>
          <p className="mt-xs text-body-sm text-ink-subtle">
            Choose the customer this draft is raised against — their tier sets the discount ceiling
            every line is scored against.
          </p>

          {customers === null ? (
            <p className="mt-md text-body-sm text-ink-subtle">Loading customers…</p>
          ) : customers.length === 0 ? (
            <p className="mt-md text-body-sm text-ink-subtle">
              No active customers yet — add one on the Customers screen first.
            </p>
          ) : (
            <div className="mt-md flex flex-wrap items-end gap-md">
              <div className="w-[22rem] max-w-full">
                <LabelledField label="Customer">
                  <select
                    aria-label="Customer"
                    className={FIELD_CLASS}
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                  >
                    <option value="">Choose a customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} — {customer.customerTier.name}, ceiling{' '}
                        {percent(customer.customerTier.ceilingPct)}
                      </option>
                    ))}
                  </select>
                </LabelledField>
              </div>
              <Button onClick={handleNewQuotation} disabled={creating || !customerId}>
                {creating ? 'Creating…' : 'Create draft'}
              </Button>
            </div>
          )}
        </Card>
      )}

      <TableShell className={error || picking ? 'mt-lg' : undefined}>
        <TableToolbar>
          <FilterPill label="Stage" value={stage} options={STAGES} neutralValue="ALL" onChange={setStage} />
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
