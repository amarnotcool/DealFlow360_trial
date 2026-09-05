// One warehouse: what it holds, and the two ways stock moves into it.
//
// Everything on this screen is a real movement against inventory_stock. A
// receipt raises on hand, a correction sets or moves it, and neither may take
// on hand below what is already reserved for a shipment — the API refuses that
// and the refusal is shown here rather than swallowed.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  ApiError,
  InventoryStockView,
  ProductListItem,
  WarehouseDetailView,
} from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  EmptyCard,
  ErrorCard,
  FIELD_CLASS,
  LabelledField,
  LoadingCard,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../../components/ui';
import { useAuth } from '../../../features/auth/useAuth';
import {
  adjustStock,
  receiveStock,
  setReorderPoint,
} from '../../../features/inventory/inventory.api';
import { fetchProducts } from '../../../features/products/products.api';
import {
  deleteWarehouse,
  fetchWarehouse,
  updateWarehouse,
} from '../../../features/warehouses/warehouses.api';
import { dateTime } from '../../../lib/format';
import { ADMIN_ONLY, INVENTORY_ROLES } from '../../../routes/access';
import { qty } from './WarehousesList';

interface EditDraft {
  code: string;
  name: string;
  address: string;
  shippingCostWeight: string;
  priority: string;
}

function toDraft(warehouse: WarehouseDetailView): EditDraft {
  return {
    code: warehouse.code,
    name: warehouse.name,
    address: warehouse.address ?? '',
    shippingCostWeight: warehouse.shippingCostWeight,
    priority: String(warehouse.priority),
  };
}

const BLANK_RECEIPT = { productId: '', productVariantId: '', quantity: '', reference: '' };

/** A correction is either a counted level or a signed movement, never both. */
interface AdjustDraft {
  row: InventoryStockView;
  mode: 'ABSOLUTE' | 'DELTA';
  value: string;
  reason: string;
}

export default function WarehouseDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user ? ADMIN_ONLY.includes(user.role) : false;
  const movesStock = user ? INVENTORY_ROLES.includes(user.role) : false;

  const [warehouse, setWarehouse] = useState<WarehouseDetailView | null>(null);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [receipt, setReceipt] = useState(BLANK_RECEIPT);
  const [adjust, setAdjust] = useState<AdjustDraft | null>(null);
  const [reorderDraft, setReorderDraft] = useState<{ id: string; value: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetchWarehouse(id);
    setWarehouse(response.data);
    setError(response.error);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (movesStock) void fetchProducts().then((response) => setProducts(response.data ?? []));
  }, [movesStock]);

  /** Runs one warehouse mutation and re-renders from what the server sent back. */
  async function run(
    action: () => Promise<{ data: WarehouseDetailView | null; error: ApiError | null }>,
    message: string,
  ) {
    setBusy(true);
    setError(null);
    const response = await action();
    setBusy(false);

    if (response.data) {
      setWarehouse(response.data);
      setNotice(message);
      return true;
    }
    setError(response.error);
    return false;
  }

  /** A stock movement answers with the row, so the warehouse is re-read after. */
  async function move(
    action: () => Promise<{
      data: { outcome: string; onHandBefore: string; onHandAfter: string } | null;
      error: ApiError | null;
    }>,
    describe: (result: { outcome: string; onHandBefore: string; onHandAfter: string }) => string,
  ) {
    setBusy(true);
    setError(null);
    const response = await action();

    if (!response.data) {
      setBusy(false);
      setError(response.error);
      return false;
    }

    setNotice(describe(response.data));
    await load();
    setBusy(false);
    return true;
  }

  async function handleSave() {
    if (!draft) return;

    const saved = await run(
      () =>
        updateWarehouse(id, {
          code: draft.code.trim().toUpperCase(),
          name: draft.name.trim(),
          address: draft.address.trim() || null,
          shippingCostWeight: Number(draft.shippingCostWeight),
          priority: Number(draft.priority),
        }),
      'Warehouse saved.',
    );

    if (saved) setDraft(null);
  }

  async function handleDeactivate() {
    setBusy(true);
    setError(null);
    const response = await deleteWarehouse(id);
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    if (response.data.outcome === 'DELETED') {
      navigate('/warehouses', { replace: true });
      return;
    }

    setNotice(
      `Deactivated — ${response.data.referenceCount} record${
        response.data.referenceCount === 1 ? '' : 's'
      } still reference it, so it is kept off the allocator rather than deleted.`,
    );
    setWarehouse(response.data.warehouse);
  }

  const selectedProduct = products.find((product) => product.id === receipt.productId);

  async function handleReceive() {
    const done = await move(
      () =>
        receiveStock({
          warehouseId: id,
          productId: receipt.productId,
          productVariantId: receipt.productVariantId || null,
          quantity: Number(receipt.quantity),
          reference: receipt.reference.trim() || null,
        }),
      (result) =>
        result.outcome === 'CREATED'
          ? `Received ${qty(result.onHandAfter)} — this warehouse had never held that product, so a new stock line was opened.`
          : `Received — on hand went from ${qty(result.onHandBefore)} to ${qty(result.onHandAfter)}.`,
    );

    if (done) {
      setReceipt(BLANK_RECEIPT);
      setReceiving(false);
    }
  }

  async function handleAdjust() {
    if (!adjust) return;
    const value = Number(adjust.value);

    const done = await move(
      () =>
        adjustStock({
          warehouseId: id,
          productId: adjust.row.product.id,
          productVariantId: adjust.row.productVariant?.id ?? null,
          ...(adjust.mode === 'ABSOLUTE' ? { newOnHand: value } : { delta: value }),
          reason: adjust.reason.trim(),
        }),
      (result) =>
        `${adjust.row.product.sku} corrected — on hand went from ${qty(result.onHandBefore)} to ${qty(
          result.onHandAfter,
        )}.`,
    );

    if (done) setAdjust(null);
  }

  async function handleReorderPoint() {
    if (!reorderDraft) return;

    const done = await move(
      () => setReorderPoint(reorderDraft.id, Number(reorderDraft.value)),
      () => 'Reorder point saved.',
    );

    if (done) setReorderDraft(null);
  }

  if (error && !warehouse) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Warehouses']} title="Warehouse">
        <ErrorCard error={error} />
      </InternalLayout>
    );
  }

  if (!warehouse) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Warehouses']} title="Warehouse">
        <LoadingCard label="Warehouse" />
      </InternalLayout>
    );
  }

  return (
    <InternalLayout
      breadcrumb={['DealFlow360', 'Warehouses']}
      title={warehouse.name}
      actions={
        isAdmin ? (
          <div className="flex items-center gap-sm">
            {draft ? (
              <>
                <Button onClick={handleSave} disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="secondary" onClick={() => setDraft(null)} disabled={busy}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => setDraft(toDraft(warehouse))}>Edit</Button>
                {warehouse.isActive ? (
                  <Button variant="secondary" onClick={handleDeactivate} disabled={busy}>
                    {busy ? 'Working…' : 'Deactivate'}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => updateWarehouse(id, { isActive: true }),
                        'Warehouse reactivated — splits can draw on it again.',
                      )
                    }
                  >
                    Reactivate
                  </Button>
                )}
              </>
            )}
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      {notice && (
        <div className="mb-lg">
          <Card tone="lemon">
            <CardLabel>Done</CardLabel>
            <p className="mt-xs text-body-md">{notice}</p>
          </Card>
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-3">
        <Card tone="obsidian">
          <CardLabel>{warehouse.code}</CardLabel>
          <p className="mt-xs text-headline-lg">{warehouse.name}</p>
          <p className="text-body-sm text-obsidian-muted">
            Ship weight {Number(warehouse.shippingCostWeight)} · priority {warehouse.priority}
          </p>
          <p className="text-body-sm text-obsidian-muted">
            {warehouse.address ?? 'No address on file'}
          </p>
          {!warehouse.isActive && (
            <p className="mt-sm">
              <Badge variant="critical">Deactivated</Badge>
            </p>
          )}
        </Card>

        <Card>
          <CardLabel>Available</CardLabel>
          <CardMetric>{qty(warehouse.totalAvailable)}</CardMetric>
          <p className="text-body-sm text-ink-subtle">
            {qty(warehouse.totalOnHand)} on hand · {qty(warehouse.totalReserved)} reserved
          </p>
        </Card>

        <Card tone={warehouse.reorderLineCount > 0 ? 'tangerine' : 'frost'}>
          <CardLabel>Open shipments</CardLabel>
          <CardMetric>{warehouse.openFulfillmentCount}</CardMetric>
          <p className="text-body-sm opacity-80">
            {warehouse.reorderLineCount > 0
              ? `${warehouse.reorderLineCount} line(s) at the reorder point`
              : 'nothing below its reorder point'}
          </p>
        </Card>
      </div>

      {draft && (
        <div className="mb-lg">
          <Card>
            <CardLabel>Edit warehouse</CardLabel>
            <div className="mt-md grid gap-md md:grid-cols-2">
              <LabelledField label="Code">
                <input
                  className={FIELD_CLASS}
                  value={draft.code}
                  onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
                />
              </LabelledField>
              <LabelledField label="Name">
                <input
                  className={FIELD_CLASS}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Address">
                <input
                  className={FIELD_CLASS}
                  value={draft.address}
                  onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Shipping cost weight">
                <input
                  type="number"
                  min={0.01}
                  step={0.05}
                  className={`${FIELD_CLASS} tabular`}
                  value={draft.shippingCostWeight}
                  onChange={(event) => setDraft({ ...draft, shippingCostWeight: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Priority">
                <input
                  type="number"
                  min={0}
                  className={`${FIELD_CLASS} tabular`}
                  value={draft.priority}
                  onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
                />
              </LabelledField>
            </div>
          </Card>
        </div>
      )}

      <TableShell className="mb-lg">
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Inventory</h2>
            <p className="text-body-sm text-ink-subtle">
              {movesStock
                ? 'Available is what a split can still draw on; reserved is already promised to a shipment.'
                : 'Read only — finance and admins move stock.'}
            </p>
          </div>
          {movesStock && warehouse.isActive && (
            <Button onClick={() => setReceiving((open) => !open)}>
              {receiving ? 'Close' : 'Receive Stock'}
            </Button>
          )}
        </TableToolbar>

        {movesStock && receiving && (
          <div className="border-b border-white/60 p-lg">
            <p className="mb-sm text-title-sm text-ink">Receive stock</p>
            <div className="grid gap-md md:grid-cols-4">
              <LabelledField label="Product">
                <select
                  aria-label="Product"
                  className={FIELD_CLASS}
                  value={receipt.productId}
                  onChange={(event) =>
                    setReceipt({ ...receipt, productId: event.target.value, productVariantId: '' })
                  }
                >
                  <option value="">Choose a product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} — {product.sku}
                    </option>
                  ))}
                </select>
              </LabelledField>

              <LabelledField label="Variant">
                <select
                  aria-label="Variant"
                  className={FIELD_CLASS}
                  value={receipt.productVariantId}
                  disabled={!selectedProduct || selectedProduct.variants.length === 0}
                  onChange={(event) => setReceipt({ ...receipt, productVariantId: event.target.value })}
                >
                  <option value="">
                    {selectedProduct && selectedProduct.variants.length > 0
                      ? 'No variant (product level)'
                      : 'Sold as one configuration'}
                  </option>
                  {(selectedProduct?.variants ?? []).map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name} — {variant.sku}
                    </option>
                  ))}
                </select>
              </LabelledField>

              <LabelledField label="Quantity">
                <input
                  type="number"
                  min={0.01}
                  step={1}
                  className={`${FIELD_CLASS} tabular`}
                  value={receipt.quantity}
                  onChange={(event) => setReceipt({ ...receipt, quantity: event.target.value })}
                  placeholder="10"
                />
              </LabelledField>

              <LabelledField label="Reference (optional)">
                <input
                  className={FIELD_CLASS}
                  value={receipt.reference}
                  onChange={(event) => setReceipt({ ...receipt, reference: event.target.value })}
                  placeholder="GRN-2026-0042"
                />
              </LabelledField>
            </div>
            <div className="mt-md flex items-center gap-sm">
              <Button
                onClick={handleReceive}
                disabled={busy || !receipt.productId || Number(receipt.quantity) <= 0}
              >
                {busy ? 'Receiving…' : 'Receive'}
              </Button>
              <p className="text-body-sm text-ink-subtle">
                A product this warehouse has never held opens a new stock line.
              </p>
            </div>
          </div>
        )}

        {warehouse.stock.length === 0 ? (
          <div className="p-lg">
            <EmptyCard
              message={
                movesStock
                  ? 'Nothing stocked here yet — receive stock to open the first line.'
                  : 'Nothing stocked here yet.'
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Reserved</Th>
                <Th className="text-right">Available</Th>
                <Th className="text-right">Reorder at</Th>
                {movesStock && <Th />}
              </tr>
            </thead>
            <tbody>
              {warehouse.stock.map((row) => {
                const editingReorder = reorderDraft?.id === row.id;

                return (
                  <Tr
                    key={row.id}
                    className={
                      row.needsReorder ? 'bg-tangerine/15 border-l-2 border-l-tangerine' : undefined
                    }
                  >
                    <Td className="font-semibold text-ink">
                      <span className="block">{row.product.name}</span>
                      <span className="block text-label-md font-normal text-ink-subtle">
                        {row.productVariant ? row.productVariant.sku : row.product.sku}
                        {row.productVariant ? ` · ${row.productVariant.name}` : ''}
                      </span>
                    </Td>
                    <Td numeric>{qty(row.onHand)}</Td>
                    <Td numeric>{qty(row.reserved)}</Td>
                    <Td numeric className={row.needsReorder ? 'text-danger' : undefined}>
                      {qty(row.available)}
                    </Td>
                    <Td numeric>
                      {editingReorder ? (
                        <input
                          type="number"
                          min={0}
                          className={`${FIELD_CLASS} tabular`}
                          aria-label={`Reorder point for ${row.product.sku}`}
                          value={reorderDraft.value}
                          onChange={(event) =>
                            setReorderDraft({ ...reorderDraft, value: event.target.value })
                          }
                        />
                      ) : (
                        <div className="flex items-center justify-end gap-xs">
                          <span>{qty(row.reorderPoint)}</span>
                          {row.needsReorder && <Badge variant="critical">Low</Badge>}
                        </div>
                      )}
                    </Td>
                    {movesStock && (
                      <Td>
                        <div className="flex items-center justify-end gap-xs">
                          {editingReorder ? (
                            <>
                              <Button variant="secondary" onClick={handleReorderPoint} disabled={busy}>
                                Save
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => setReorderDraft(null)}
                                disabled={busy}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                onClick={() =>
                                  setAdjust({
                                    row,
                                    mode: 'ABSOLUTE',
                                    value: String(Number(row.onHand)),
                                    reason: '',
                                  })
                                }
                              >
                                Adjust
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() =>
                                  setReorderDraft({ id: row.id, value: String(Number(row.reorderPoint)) })
                                }
                              >
                                Reorder point
                              </Button>
                            </>
                          )}
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        {movesStock && adjust && (
          <div className="border-t border-white/60 p-lg">
            <p className="mb-sm text-title-sm text-ink">
              Correct {adjust.row.product.name}
              <span className="ml-xs text-label-md font-normal text-ink-subtle">
                {adjust.row.reserved !== '0.00'
                  ? `${qty(adjust.row.reserved)} reserved — a count cannot go below that`
                  : 'nothing reserved on this line'}
              </span>
            </p>

            <div className="grid gap-md md:grid-cols-[10rem_10rem_1fr]">
              <LabelledField label="Correction">
                <select
                  aria-label="Correction"
                  className={FIELD_CLASS}
                  value={adjust.mode}
                  onChange={(event) =>
                    setAdjust({
                      ...adjust,
                      mode: event.target.value as AdjustDraft['mode'],
                      value: event.target.value === 'ABSOLUTE' ? String(Number(adjust.row.onHand)) : '',
                    })
                  }
                >
                  <option value="ABSOLUTE">Counted total</option>
                  <option value="DELTA">Movement (+/-)</option>
                </select>
              </LabelledField>

              <LabelledField label={adjust.mode === 'ABSOLUTE' ? 'New on hand' : 'Change by'}>
                <input
                  type="number"
                  step={1}
                  className={`${FIELD_CLASS} tabular`}
                  value={adjust.value}
                  onChange={(event) => setAdjust({ ...adjust, value: event.target.value })}
                  placeholder={adjust.mode === 'ABSOLUTE' ? '8' : '-2'}
                />
              </LabelledField>

              <LabelledField label="Reason">
                <input
                  className={FIELD_CLASS}
                  value={adjust.reason}
                  onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })}
                  placeholder="Cycle count 06 Sep, two units damaged"
                />
              </LabelledField>
            </div>

            <div className="mt-md flex items-center gap-sm">
              <Button
                onClick={handleAdjust}
                disabled={busy || !adjust.reason.trim() || adjust.value.trim() === ''}
              >
                {busy ? 'Saving…' : 'Apply Correction'}
              </Button>
              <Button variant="secondary" onClick={() => setAdjust(null)} disabled={busy}>
                Cancel
              </Button>
              <p className="text-body-sm text-ink-subtle">
                The reason is written to the audit log with the before and after levels.
              </p>
            </div>
          </div>
        )}
      </TableShell>

      <p className="text-body-sm text-ink-subtle">Last updated {dateTime(warehouse.updatedAt)}</p>
    </InternalLayout>
  );
}
