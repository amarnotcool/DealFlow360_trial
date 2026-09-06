// The warehouse network: where stock sits, and how much of it is spoken for.
//
// Everyone signed in reads this — a rep quoting from stock needs it. Adding or
// editing a warehouse is admin work (specs.md §2), and the API enforces that
// on its own.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, WarehouseSummary } from '@dealflow360/shared';

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
  LoadingCard,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { useAuth } from '../../../features/auth/useAuth';
import { fetchWarehouses } from '../../../features/warehouses/warehouses.api';
import { ADMIN_ONLY } from '../../../routes/access';
import { NewWarehouseForm } from './NewWarehouseForm';

/** Quantities are Decimal strings; whole units read better without the .00. */
export const qty = (value: string): string => String(Number(value));

export default function WarehousesList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user ? ADMIN_ONLY.includes(user.role) : false;

  const [rows, setRows] = useState<WarehouseSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    const response = await fetchWarehouses(includeInactive);
    setRows(response.data ?? []);
    setError(response.error);
  }, [includeInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const list = rows ?? [];
    return {
      available: list.reduce((sum, row) => sum + Number(row.totalAvailable), 0),
      reserved: list.reduce((sum, row) => sum + Number(row.totalReserved), 0),
      reorder: list.reduce((sum, row) => sum + row.reorderLineCount, 0),
    };
  }, [rows]);

  return (
    <InternalLayout
      breadcrumb={['DealFlow360']}
      title="Warehouses"
      actions={
        isAdmin ? (
          <Button onClick={() => setCreating((open) => !open)}>
            {creating ? 'Close' : 'New Warehouse'}
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
          <CardLabel>Available to promise</CardLabel>
          <CardMetric>{rows ? totals.available : '—'}</CardMetric>
          <p className="text-body-sm text-obsidian-muted">units a split can still draw on</p>
        </Card>
        <Card>
          <CardLabel>Reserved</CardLabel>
          <CardMetric>{rows ? totals.reserved : '—'}</CardMetric>
          <p className="text-body-sm text-ink-subtle">promised to shipments, not yet shipped</p>
        </Card>
        <Card tone={totals.reorder > 0 ? 'tangerine' : 'frost'}>
          <CardLabel>At reorder point</CardLabel>
          <CardMetric>{rows ? totals.reorder : '—'}</CardMetric>
          <p className="text-body-sm opacity-80">
            {totals.reorder > 0 ? 'lines that need restocking' : 'nothing needs restocking'}
          </p>
        </Card>
      </div>

      {creating && isAdmin && (
        <div className="mb-lg">
          <NewWarehouseForm
            onCancel={() => setCreating(false)}
            onCreated={(warehouse) => {
              setCreating(false);
              navigate(`/warehouses/${warehouse.id}`);
            }}
          />
        </div>
      )}

      <TableShell>
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Network</h2>
            <p className="text-body-sm text-ink-subtle">
              {isAdmin
                ? 'Open a warehouse to receive stock, correct a count, or set a reorder point.'
                : 'Open a warehouse to see what it holds.'}
            </p>
          </div>
          <FilterChip
            label="Status"
            active={includeInactive}
            onClick={() => setIncludeInactive((value) => !value)}
          >
            {includeInactive ? 'All' : 'Active'}
          </FilterChip>
        </TableToolbar>

        {rows === null ? (
          <div className="p-lg">
            <LoadingCard label="Warehouses" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-lg">
            <EmptyCard message="No warehouses yet — an admin adds the first one." />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Warehouse</Th>
                <Th className="text-right">Priority</Th>
                <Th className="text-right">Ship weight</Th>
                <Th className="text-right">Lines</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Available</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/warehouses/${row.id}`)}
                >
                  <Td className="font-semibold text-ink">
                    <span className="block">{row.name}</span>
                    <span className="block text-label-md font-normal text-ink-subtle">
                      {row.code}
                      {row.address ? ` · ${row.address}` : ''}
                    </span>
                  </Td>
                  <Td numeric>{row.priority}</Td>
                  <Td numeric>{Number(row.shippingCostWeight)}</Td>
                  <Td numeric>{row.stockLineCount}</Td>
                  <Td numeric>{qty(row.totalOnHand)}</Td>
                  <Td numeric>{qty(row.totalAvailable)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-xs">
                      {row.isActive ? (
                        <span className="text-body-sm text-ink-subtle">Active</span>
                      ) : (
                        <Badge variant="critical">Deactivated</Badge>
                      )}
                      {row.reorderLineCount > 0 && (
                        <Badge variant="critical">{row.reorderLineCount} low</Badge>
                      )}
                    </div>
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
