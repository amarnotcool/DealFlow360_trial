// The customer book: every account, its tier and who owns the relationship.
//
// Reps and admins maintain the book (specs.md §2); managers and finance read
// it, so the screen is read-only for them rather than closed to them.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, CustomerListItem, CustomerTierView } from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  EmptyCard,
  ErrorCard,
  FilterChip,
  FilterPill,
  LoadingCard,
  SearchInput,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui/Badge';
import { useAuth } from '../../../features/auth/useAuth';
import { fetchCustomerTiers, fetchCustomers } from '../../../features/customers/customers.api';
import { percent } from '../../../lib/format';
import { CUSTOMER_WRITE_ROLES } from '../../../routes/access';
import { NewCustomerForm } from './NewCustomerForm';

/** Gold sits highest, so the top tier reads as the primary pill. */
const TIER_VARIANT: Record<string, BadgeVariant> = {
  GOLD: 'primary',
  SILVER: 'info',
  BRONZE: 'neutral',
};

export function TierBadge({ tier }: { tier: CustomerTierView }) {
  return <Badge variant={TIER_VARIANT[tier.code] ?? 'neutral'}>{tier.name}</Badge>;
}

export default function CustomersList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user ? CUSTOMER_WRITE_ROLES.includes(user.role) : false;

  const [rows, setRows] = useState<CustomerListItem[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [tiers, setTiers] = useState<CustomerTierView[]>([]);
  const [error, setError] = useState<ApiError | null>(null);

  const [search, setSearch] = useState('');
  const [customerTierId, setCustomerTierId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    const response = await fetchCustomers({
      search: search.trim() || undefined,
      customerTierId: customerTierId || undefined,
      includeInactive,
    });

    setRows(response.data ?? []);
    setTotal(response.meta?.total ?? null);
    setError(response.error);
  }, [search, customerTierId, includeInactive]);

  useEffect(() => {
    // Typing filters the list, so the request waits for a pause in typing.
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    void fetchCustomerTiers().then((response) => setTiers(response.data ?? []));
  }, []);

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      contacts: list.reduce((sum, row) => sum + row.contactCount, 0),
      quotations: list.reduce((sum, row) => sum + row.quotationCount, 0),
    };
  }, [rows]);

  const activeTier = tiers.find((tier) => tier.id === customerTierId);

  return (
    <InternalLayout
      breadcrumb={['DealFlow360']}
      title="Customers"
      actions={
        canWrite ? (
          <Button onClick={() => setCreating((open) => !open)}>
            {creating ? 'Close' : 'New Customer'}
          </Button>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-3">
        <Card tone="obsidian">
          <CardLabel>Accounts listed</CardLabel>
          <CardMetric>{total ?? '—'}</CardMetric>
          <p className="text-body-sm text-obsidian-muted">
            {includeInactive ? 'including deactivated' : 'active accounts'}
          </p>
        </Card>
        <Card>
          <CardLabel>Contacts on file</CardLabel>
          <CardMetric>{rows ? counts.contacts : '—'}</CardMetric>
          <p className="text-body-sm text-ink-subtle">people across these accounts</p>
        </Card>
        <Card>
          <CardLabel>Quotations raised</CardLabel>
          <CardMetric>{rows ? counts.quotations : '—'}</CardMetric>
          <p className="text-body-sm text-ink-subtle">across every stage</p>
        </Card>
      </div>

      {creating && canWrite && (
        <div className="mb-lg">
          <NewCustomerForm
            tiers={tiers}
            onCancel={() => setCreating(false)}
            onCreated={(customer) => {
              setCreating(false);
              navigate(`/customers/${customer.id}`);
            }}
          />
        </div>
      )}

      <TableShell>
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Customer book</h2>
            <p className="text-body-sm text-ink-subtle">
              {canWrite
                ? 'Open an account to change its tier or manage its contacts.'
                : 'Read only — reps and admins maintain the customer book.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-xs">
            <SearchInput
              placeholder="Search name, code or email"
              aria-label="Search customers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-[16rem] max-w-full"
            />
            <FilterPill
              label="Tier"
              value={customerTierId}
              neutralValue=""
              options={[
                { value: '', label: 'All' },
                ...tiers.map((tier) => ({ value: tier.id, label: tier.name })),
              ]}
              onChange={setCustomerTierId}
            />
            <FilterChip
              label="Status"
              active={includeInactive}
              onClick={() => setIncludeInactive((value) => !value)}
            >
              {includeInactive ? 'All' : 'Active'}
            </FilterChip>
          </div>
        </TableToolbar>

        {rows === null ? (
          <div className="p-lg">
            <LoadingCard label="Customers" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-lg">
            <EmptyCard
              message={
                search || customerTierId
                  ? `No customers match ${search ? `"${search}"` : ''}${
                      search && activeTier ? ' in ' : ''
                    }${activeTier ? activeTier.name : ''}.`
                  : 'No customers on the book yet.'
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Tier</Th>
                <Th>Account owner</Th>
                <Th className="text-right">Contacts</Th>
                <Th className="text-right">Quotations</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/customers/${row.id}`)}
                >
                  <Td className="font-semibold text-ink">
                    <span className="block">{row.name}</span>
                    <span className="block text-label-md font-normal text-ink-subtle">
                      {row.code}
                      {row.email ? ` · ${row.email}` : ''}
                    </span>
                  </Td>
                  <Td>
                    <TierBadge tier={row.customerTier} />
                  </Td>
                  <Td className="text-ink-subtle">{row.accountOwner?.fullName ?? 'Unassigned'}</Td>
                  <Td numeric>{row.contactCount}</Td>
                  <Td numeric>{row.quotationCount}</Td>
                  <Td>
                    {row.isActive ? (
                      <span className="text-body-sm text-ink-subtle">Active</span>
                    ) : (
                      <Badge variant="critical">Deactivated</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableShell>

      <p className="mt-lg text-body-sm text-ink-subtle">
        Tier ceilings cap the discount a rep can give without approval:{' '}
        {tiers.map((tier) => `${tier.name} ${percent(tier.ceilingPct)}`).join(' · ') || '—'}
      </p>
    </InternalLayout>
  );
}
