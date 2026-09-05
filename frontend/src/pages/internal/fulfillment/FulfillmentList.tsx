// Screen 7 (specs.md §6): live stock per warehouse, and the orders waiting on it.
//
// Both halves come from GET /fulfillment — the stock numbers are the same rows
// the allocator draws from, so what is shown here is what a split can use.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, SalesOrderListItem, WarehouseStockView } from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Card,
  CardLabel,
  EmptyCard,
  ErrorCard,
  LoadingCard,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { fetchFulfillmentOrders } from '../../../features/fulfillment/fulfillment.api';
import { humanise, money } from '../../../lib/format';

const qty = (value: string): string => String(Number(value));

function WarehouseCard({ warehouse }: { warehouse: WarehouseStockView }) {
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-sm">
        <div>
          <CardLabel>{warehouse.code}</CardLabel>
          <p className="text-title-md text-ink">{warehouse.name}</p>
        </div>
        <Badge variant="neutral">weight {Number(warehouse.shippingCostWeight)}</Badge>
      </div>

      <table className="tabular mt-md w-full text-body-sm">
        <thead>
          <tr className="text-label-md text-ink-subtle">
            <th className="pb-2xs text-left font-medium">Item</th>
            <th className="pb-2xs text-right font-medium">In stock</th>
            <th className="pb-2xs text-right font-medium">Reserved</th>
            <th className="pb-2xs text-right font-medium">Available</th>
          </tr>
        </thead>
        <tbody>
          {warehouse.lines.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-sm text-ink-subtle">
                No stock rows in this warehouse.
              </td>
            </tr>
          ) : (
            warehouse.lines.map((row) => (
              <tr key={`${warehouse.id}-${row.sku}`} className="border-t border-hairline">
                <td className="py-xs pr-sm text-ink-body">
                  <span className="block text-ink">{row.name}</span>
                  <span className="block text-label-md text-ink-subtle">{row.sku}</span>
                </td>
                <td className="py-xs text-right text-ink-body">{qty(row.onHand)}</td>
                <td className="py-xs text-right text-ink-body">{qty(row.reserved)}</td>
                <td
                  className={
                    Number(row.available) === 0
                      ? 'py-xs text-right font-semibold text-danger'
                      : 'py-xs text-right font-semibold text-ink'
                  }
                >
                  {qty(row.available)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}

export default function FulfillmentList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<SalesOrderListItem[] | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseStockView[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const response = await fetchFulfillmentOrders();
    setRows(response.data ?? []);
    setWarehouses(response.meta?.warehouses ?? []);
    setTotal(response.meta?.total ?? response.data?.length ?? 0);
    setError(response.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <InternalLayout breadcrumb={['DealFlow360']} title="Fulfillment">
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mb-lg grid gap-gutter lg:grid-cols-2">
        {rows === null && warehouses.length === 0 ? (
          <LoadingCard label="Warehouse stock" />
        ) : (
          warehouses.map((warehouse) => <WarehouseCard key={warehouse.id} warehouse={warehouse} />)
        )}
      </div>

      <TableShell>
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Orders awaiting fulfillment</h2>
            <p className="text-body-sm text-ink-subtle">
              Confirmed sales orders. Open one to see the split the allocator suggests.
            </p>
          </div>
          <Badge variant="neutral">{total} total</Badge>
        </TableToolbar>

        {rows === null ? (
          <div className="p-lg">
            <LoadingCard label="Orders" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-lg">
            <EmptyCard message="No confirmed orders yet — confirm an approved quotation to start fulfillment." />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th className="text-right">Lines</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Split</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/fulfillment/${row.id}`)}
                >
                  <Td className="font-semibold text-ink">
                    <span className="block">{row.number}</span>
                    <span className="block text-label-md font-normal text-ink-subtle">
                      from {row.quotation.number}
                    </span>
                  </Td>
                  <Td>{row.customer.name}</Td>
                  <Td numeric>{row._count.lines}</Td>
                  <Td numeric>{money(row.totalAmount)}</Td>
                  <Td>
                    <Badge variant="neutral">{humanise(row.status)}</Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-xs">
                      <Badge variant={row.latestSuggestion ? 'info' : 'neutral'}>
                        {row.latestSuggestion ? humanise(row.latestSuggestion.status) : 'Not suggested'}
                      </Badge>
                      {row._count.fulfillments > 0 && (
                        <Badge variant="primary">{row._count.fulfillments} shipments</Badge>
                      )}
                      {row._count.backorders > 0 && (
                        <Badge variant="critical">{row._count.backorders} backordered</Badge>
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
