// Screen 8 (specs.md §6): the suggested warehouse split, and the decision on it.
//
// Every quantity shown here comes from the allocator through the API — this
// screen never decides where a line ships from, not even in override mode,
// where it only sends the quantities the user typed.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  ApiError,
  BackorderConsolidationResult,
  FulfillmentDetailView,
  SuggestedSplitLine,
  WarehouseStockView,
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
import {
  acceptSplit,
  consolidateBackorders,
  fetchFulfillmentOrder,
  fetchFulfillmentOrders,
  overrideSplit,
  shipFulfillments,
  suggestSplit,
} from '../../../features/fulfillment/fulfillment.api';
import type { OverrideAllocation } from '../../../features/fulfillment/fulfillment.api';
import { useAuth } from '../../../features/auth/useAuth';
import { humanise, money } from '../../../lib/format';
import { INVENTORY_ROLES } from '../../../routes/access';

const SKIPPED_REASON: Record<string, string> = {
  NOT_STOCK_TRACKED: 'Not stock tracked — nothing to ship',
  RECURRING: 'Recurring line — billed, not shipped',
  ALREADY_FULFILLED: 'Already fulfilled',
};

const qty = (value: string | number): string => String(Number(value));

/** Override quantities, keyed `${lineId}|${warehouseId}`. */
type OverrideDraft = Record<string, string>;

const draftKey = (lineId: string, warehouseId: string): string => `${lineId}|${warehouseId}`;

/** Seeds the override grid with the split the allocator suggested. */
function seedDraft(lines: SuggestedSplitLine[]): OverrideDraft {
  const draft: OverrideDraft = {};
  for (const line of lines) {
    for (const allocation of line.allocations) {
      draft[draftKey(line.lineId, allocation.warehouseId)] = String(allocation.quantity);
    }
  }
  return draft;
}

export default function FulfillmentDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Finance and Ops decide where an order ships from (specs.md §2); the API
  // guards the endpoint itself.
  const canConsolidate = user ? INVENTORY_ROLES.includes(user.role) : false;

  const [order, setOrder] = useState<FulfillmentDetailView | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseStockView[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [draft, setDraft] = useState<OverrideDraft>({});
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [consolidation, setConsolidation] = useState<BackorderConsolidationResult | null>(null);

  const load = useCallback(async () => {
    const [detail, list] = await Promise.all([fetchFulfillmentOrder(id), fetchFulfillmentOrders()]);
    setOrder(detail.data);
    setError(detail.error);
    // The warehouse columns of the override grid come from the same live stock
    // view screen 7 shows, so an override can only name a real warehouse.
    setWarehouses(list.meta?.warehouses ?? []);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<{ data: FulfillmentDetailView | null; error: ApiError | null }>, done: string) {
    setBusy(true);
    const response = await action();
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    setOrder(response.data);
    setError(null);
    setNotice(done);
    setOverriding(false);
    await load();
  }

  /**
   * Accepting persists the suggestion first when nothing is stored yet, so the
   * screen's visible split and the accepted one are the same allocation.
   */
  async function handleAccept() {
    setBusy(true);
    let suggestionId = suggestion?.status === 'SUGGESTED' ? suggestion.id : null;

    if (!suggestionId) {
      const generated = await suggestSplit(id);
      if (!generated.data) {
        setBusy(false);
        setError(generated.error);
        return;
      }
      suggestionId = generated.data.latestSuggestion?.id ?? null;
    }
    setBusy(false);

    await run(
      () => acceptSplit(id, suggestionId),
      'Split accepted — stock reserved and shipments created.',
    );
  }

  /**
   * specs.md §4: once stock arrives, the remaining backorder is consolidated
   * into new shipments. The API answers with what it could allocate, including
   * "nothing arrived yet", and that answer is what the card reports.
   */
  async function handleConsolidate() {
    setBusy(true);
    setError(null);
    const response = await consolidateBackorders(id);
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    setConsolidation(response.data);
    setNotice(
      response.data.fulfillmentIds.length === 0
        ? 'Nothing to consolidate yet — no stock has arrived for what is short.'
        : 'Backorder consolidated — stock reserved and shipments created.',
    );
    await load();
  }

  function handleOverrideStart() {
    if (!order) return;
    setDraft(seedDraft(order.suggestedSplit.lines));
    setOverriding(true);
    setNotice(null);
  }

  async function handleOverrideSubmit() {
    const allocations: OverrideAllocation[] = Object.entries(draft)
      .map(([key, value]) => {
        const [salesOrderLineId = '', warehouseId = ''] = key.split('|');
        return { salesOrderLineId, warehouseId, quantity: Number(value) };
      })
      .filter((allocation) => Number.isFinite(allocation.quantity) && allocation.quantity > 0);

    if (allocations.length === 0) {
      setError({ code: 'VALIDATION_ERROR', message: 'Enter at least one quantity to override with' });
      return;
    }

    await run(
      () => overrideSplit(id, { reason: reason.trim() || null, allocations }),
      'Manual override applied — stock reserved as entered.',
    );
    setReason('');
  }

  if (error && !order) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Fulfillment']} title="Fulfillment">
        <ErrorCard error={error} />
      </InternalLayout>
    );
  }

  if (!order) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Fulfillment']} title="Fulfillment">
        <LoadingCard label="Order" />
      </InternalLayout>
    );
  }

  const split = order.suggestedSplit;
  // The heading names what is on screen: a live suggestion, or the stored
  // snapshot of the split that was accepted or overridden.
  const splitTitle =
    order.splitStatus === 'ACCEPTED'
      ? 'Accepted split'
      : order.splitStatus === 'OVERRIDDEN'
        ? 'Overridden split'
        : 'Suggested split';
  const decided = order.fulfillments.length > 0;
  const suggestion = order.latestSuggestion;
  // Shipping is what lets billing happen: the one-time invoice is raised for
  // the quantities these shipments carry (specs.md §4 reconciliation rule).
  const unshipped = order.fulfillments.filter(
    (fulfillment) => fulfillment.status === 'RESERVED' || fulfillment.status === 'PENDING',
  );

  return (
    <InternalLayout
      breadcrumb={['DealFlow360', 'Fulfillment', order.number]}
      title={`${order.number} — ${order.customer.name}`}
      actions={
        decided ? (
          <>
            <Badge variant="info">
              {order.fulfillments.length} shipments · {unshipped.length} awaiting dispatch
            </Badge>
            {unshipped.length > 0 ? (
              <Button
                onClick={() =>
                  void run(
                    () => shipFulfillments(id),
                    'Shipped — a one-time invoice was raised for the shipped quantities only.',
                  )
                }
                disabled={busy}
              >
                {busy ? 'Working…' : 'Mark Shipped'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => navigate('/invoices')}>
                View invoices
              </Button>
            )}
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => void run(() => suggestSplit(id), 'Split suggested from live stock.')}
              disabled={busy}
            >
              {suggestion ? 'Re-suggest split' : 'Suggest split'}
            </Button>
            {overriding ? (
              <>
                <Button variant="ghost" onClick={() => setOverriding(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={handleOverrideSubmit} disabled={busy}>
                  {busy ? 'Working…' : 'Send Override'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={handleOverrideStart} disabled={busy}>
                  Manual Override
                </Button>
                <Button onClick={handleAccept} disabled={busy || split.shipments.length === 0}>
                  {busy ? 'Working…' : 'Accept Suggested Split'}
                </Button>
              </>
            )}
          </>
        )
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
          <CardLabel>Estimated shipments</CardLabel>
          <CardMetric>{split.estimatedShipmentCount}</CardMetric>
          <p className="text-body-sm text-obsidian-muted">
            cost weight {split.estimatedCost} · fewest warehouses that can cover the order
          </p>
        </Card>
        <Card tone={split.totalBackorderQty > 0 ? 'tangerine' : 'frost'}>
          <CardLabel>Backordered units</CardLabel>
          <CardMetric>{split.totalBackorderQty}</CardMetric>
          <p className="text-body-sm opacity-80">
            {split.totalBackorderQty > 0 ? 'Stock cannot cover every line' : 'Every line is covered'}
          </p>
        </Card>
        <Card>
          <CardLabel>Order total</CardLabel>
          <CardMetric>{money(order.totalAmount)}</CardMetric>
          <p className="text-body-sm text-ink-subtle">
            {order.lines.length} lines · {humanise(order.status)}
          </p>
        </Card>
        <Card>
          <CardLabel>Split status</CardLabel>
          <p className="mt-xs text-headline-lg text-ink">
            {suggestion ? humanise(suggestion.status) : 'Not suggested'}
          </p>
          <Button variant="ghost" className="mt-sm" onClick={() => navigate(`/quotations/${order.quotation.id}`)}>
            From {order.quotation.number}
          </Button>
        </Card>
      </div>

      <TableShell className="mb-lg">
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">
              {overriding ? 'Manual override' : splitTitle}
            </h2>
            <p className="text-body-sm text-ink-subtle">
              {overriding
                ? 'Type the quantity to ship from each warehouse. Blank or zero ships nothing.'
                : order.splitStatus === null || order.splitStatus === 'SUGGESTED'
                  ? 'Deepest stock first, then the cheaper warehouse — the allocator picks the fewest shipments.'
                  : 'The split this order is being fulfilled from, as it was recorded.'}
            </p>
          </div>
          <div className="flex items-center gap-xs">
            {split.shipments.map((shipment) => (
              <Badge key={shipment.warehouseId} variant="dark">
                {shipment.warehouseCode} · {qty(shipment.totalQty)} units · cost {shipment.shippingCostWeight}
              </Badge>
            ))}
          </div>
        </TableToolbar>

        <Table>
          <thead>
            <tr>
              <Th>Line</Th>
              <Th className="text-right">Required</Th>
              {overriding ? (
                warehouses.map((warehouse) => (
                  <Th key={warehouse.id} className="text-right">
                    {warehouse.code}
                  </Th>
                ))
              ) : (
                <Th>Ships from</Th>
              )}
              <Th className="text-right">Backorder</Th>
            </tr>
          </thead>
          <tbody>
            {split.lines.map((line) => (
              <Tr
                key={line.lineId}
                className={line.backorderQty > 0 ? 'bg-tangerine/15 border-l-2 border-l-tangerine' : undefined}
              >
                <Td>
                  <span className="block text-title-sm text-ink">{line.description ?? line.lineId}</span>
                  <span className="block text-label-md text-ink-subtle">
                    {line.allocatedQty} of {line.requiredQty} allocated
                  </span>
                </Td>
                <Td numeric>{qty(line.requiredQty)}</Td>

                {overriding ? (
                  warehouses.map((warehouse) => (
                    <Td key={warehouse.id} numeric>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={draft[draftKey(line.lineId, warehouse.id)] ?? ''}
                        aria-label={`Quantity for ${line.description ?? line.lineId} from ${warehouse.code}`}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [draftKey(line.lineId, warehouse.id)]: event.target.value,
                          }))
                        }
                        className="frost-input tabular w-20 rounded-full px-sm py-[0.25rem] text-right text-body-md
                          focus:outline-none focus:ring-2 focus:ring-lemon/60"
                      />
                    </Td>
                  ))
                ) : (
                  <Td>
                    <div className="flex flex-wrap items-center gap-xs">
                      {line.allocations.length === 0 ? (
                        <span className="text-body-sm text-ink-subtle">Nothing available</span>
                      ) : (
                        line.allocations.map((allocation) => (
                          <Badge key={allocation.warehouseId} variant="info">
                            {allocation.warehouseCode} · {qty(allocation.quantity)}
                          </Badge>
                        ))
                      )}
                    </div>
                  </Td>
                )}

                <Td numeric>
                  {line.backorderQty > 0 ? (
                    <Badge variant="critical">short {qty(line.backorderQty)}</Badge>
                  ) : (
                    <span className="text-ink-subtle">0</span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>

        {split.skipped.length > 0 && (
          <div className="border-t border-hairline px-lg py-md">
            <p className="text-label-md text-ink-subtle">Outside fulfillment scope</p>
            <ul className="mt-xs flex flex-col gap-2xs">
              {split.skipped.map((line) => (
                <li key={line.salesOrderLineId} className="text-body-sm text-ink-subtle">
                  {line.description ?? line.salesOrderLineId} —{' '}
                  {SKIPPED_REASON[line.reason] ?? humanise(line.reason)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </TableShell>

      {overriding && (
        <Card className="mb-lg">
          <CardLabel>Override reason</CardLabel>
          <p className="mt-xs text-body-sm text-ink-subtle">
            Written to the audit log as MANUAL_OVERRIDE, with the signed-in user as the actor.
          </p>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="Why is this split different from the suggestion?"
            className="frost-input mt-sm w-full rounded-md px-md py-sm text-body-md text-ink-body
              placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60"
          />
        </Card>
      )}

      {order.fulfillments.length > 0 && (
        <Card className="mb-lg">
          <CardLabel>Shipments</CardLabel>
          <ul className="mt-md flex flex-col gap-sm">
            {order.fulfillments.map((fulfillment) => (
              <li key={fulfillment.id} className="flex flex-wrap items-center gap-sm">
                <Badge variant="dark">{fulfillment.warehouse.code}</Badge>
                <Badge variant="info">{humanise(fulfillment.status)}</Badge>
                <span className="tabular text-body-sm text-ink-body">
                  {fulfillment.lines.reduce((sum, line) => sum + Number(line.quantity), 0)} units · cost{' '}
                  {Number(fulfillment.shippingCost)}
                </span>
                {fulfillment.isManualOverride && <Badge variant="primary">Manual override</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {order.backorders.length > 0 && (
        <Card tone="tangerine">
          <CardLabel>Backorders</CardLabel>
          <ul className="mt-md flex flex-col gap-sm">
            {order.backorders.map((backorder) => {
              const line = order.lines.find((row) => row.id === backorder.salesOrderLine.id);
              return (
                <li key={backorder.id} className="flex flex-wrap items-center gap-sm">
                  <span className="text-title-sm">{line?.product.name ?? backorder.salesOrderLine.id}</span>
                  <span className="tabular text-body-sm">short {qty(backorder.quantity)}</span>
                  <Badge variant="dark">{humanise(backorder.status)}</Badge>
                </li>
              );
            })}
          </ul>

          {consolidation && (
            <p className="mt-md text-body-md">
              {consolidation.fulfillmentIds.length === 0
                ? `No stock has arrived yet — ${qty(consolidation.totalStillShort)} still short.`
                : `Consolidated ${qty(consolidation.totalAllocated)} into ${
                    consolidation.fulfillmentIds.length
                  } shipment(s); ${
                    Number(consolidation.totalStillShort) === 0
                      ? 'nothing is short any more.'
                      : `${qty(consolidation.totalStillShort)} still short.`
                  }`}
            </p>
          )}

          {canConsolidate ? (
            <div className="mt-md flex flex-wrap items-center gap-sm">
              <Button variant="obsidian" onClick={handleConsolidate} disabled={busy}>
                {busy ? 'Working…' : 'Consolidate Remaining Backorder'}
              </Button>
              <span className="text-body-sm opacity-80">
                Runs the allocator again over what is short and reserves whatever stock has arrived.
              </span>
            </div>
          ) : (
            <p className="mt-md text-body-sm opacity-80">
              Finance consolidates a backorder once stock arrives.
            </p>
          )}
        </Card>
      )}
    </InternalLayout>
  );
}
