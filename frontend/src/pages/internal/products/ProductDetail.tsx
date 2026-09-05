// Screen 17 (specs.md §6): one product — its terms, its variants, where it is
// stocked, and what it is priced at on any price list.
//
// Removing a product is the API's decision, not this screen's: it deletes one
// nothing has used and deactivates one existing records point at, and says
// which it did. The screen reports that answer rather than assuming either.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  ApiError,
  CategoryView,
  ProductDetailView,
  ProductVariantView,
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
  addVariant,
  deleteProduct,
  deleteVariant,
  fetchCategories,
  fetchProduct,
  updateProduct,
  updateVariant,
} from '../../../features/products/products.api';
import { dateTime, humanise, money } from '../../../lib/format';
import { CYCLES, FIELD_CLASS, LabelledField } from './form-fields';

/** Draft of the edit form, seeded from the product being edited. */
interface EditDraft {
  name: string;
  sku: string;
  categoryId: string;
  listPrice: string;
  unitCost: string;
  description: string;
  isSubscription: boolean;
  recurringCycle: string;
}

function toDraft(product: ProductDetailView): EditDraft {
  return {
    name: product.name,
    sku: product.sku,
    categoryId: product.category.id,
    listPrice: product.listPrice,
    unitCost: product.unitCost,
    description: product.description ?? '',
    isSubscription: product.isSubscription,
    recurringCycle: product.recurringCycle ?? 'MONTHLY',
  };
}

export default function ProductDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [product, setProduct] = useState<ProductDetailView | null>(null);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [newVariant, setNewVariant] = useState({ name: '', sku: '', extraPrice: '0' });
  const [variantDraft, setVariantDraft] = useState<{ id: string; name: string; extraPrice: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    const response = await fetchProduct(id);
    setProduct(response.data);
    setError(response.error);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (isAdmin) void fetchCategories().then((response) => setCategories(response.data ?? []));
  }, [isAdmin]);

  /** Runs one mutation, then re-renders from whatever the server sent back. */
  async function run(
    action: () => Promise<{ data: ProductDetailView | null; error: ApiError | null }>,
    message: string,
  ) {
    setBusy(true);
    setError(null);
    const response = await action();
    setBusy(false);

    if (response.data) {
      setProduct(response.data);
      setNotice(message);
      return true;
    }
    setError(response.error);
    return false;
  }

  async function handleSave() {
    if (!draft) return;

    const saved = await run(
      () =>
        updateProduct(id, {
          name: draft.name.trim(),
          sku: draft.sku.trim(),
          categoryId: draft.categoryId,
          description: draft.description.trim() || null,
          listPrice: Number(draft.listPrice),
          unitCost: Number(draft.unitCost),
          isSubscription: draft.isSubscription,
          recurringCycle: draft.isSubscription ? draft.recurringCycle : null,
        }),
      'Product saved.',
    );

    if (saved) setDraft(null);
  }

  async function handleAddVariant() {
    const added = await run(
      () =>
        addVariant(id, {
          name: newVariant.name.trim(),
          sku: newVariant.sku.trim(),
          extraPrice: Number(newVariant.extraPrice || 0),
        }),
      'Variant added.',
    );

    if (added) setNewVariant({ name: '', sku: '', extraPrice: '0' });
  }

  async function handleSaveVariant() {
    if (!variantDraft) return;

    const saved = await run(
      () =>
        updateVariant(id, variantDraft.id, {
          name: variantDraft.name.trim(),
          extraPrice: Number(variantDraft.extraPrice || 0),
        }),
      'Variant saved.',
    );

    if (saved) setVariantDraft(null);
  }

  async function handleDeleteVariant(variant: ProductVariantView) {
    setBusy(true);
    setError(null);
    const response = await deleteVariant(id, variant.id);
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    setNotice(
      response.data.outcome === 'DELETED'
        ? `Variant ${variant.sku} removed — nothing referenced it.`
        : `Variant ${variant.sku} deactivated — existing records still reference it.`,
    );
    if (response.data.product) setProduct(response.data.product);
    else void load();
  }

  async function handleDeleteProduct() {
    setBusy(true);
    setError(null);
    const response = await deleteProduct(id);
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    if (response.data.outcome === 'DELETED') {
      navigate('/products', { replace: true });
      return;
    }

    setNotice(
      `Deactivated — referenced by ${response.data.usageCount} quotation line${
        response.data.usageCount === 1 ? '' : 's'
      }, so its history is kept.`,
    );
    if (response.data.product) setProduct(response.data.product);
  }

  if (error && !product) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Products']} title="Product">
        <ErrorCard error={error} />
      </InternalLayout>
    );
  }

  if (!product) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Products']} title="Product">
        <LoadingCard label="Product" />
      </InternalLayout>
    );
  }

  return (
    <InternalLayout
      breadcrumb={['DealFlow360', 'Products']}
      title={product.name}
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
                <Button onClick={() => setDraft(toDraft(product))}>Edit</Button>
                {product.isActive ? (
                  <Button variant="secondary" onClick={handleDeleteProduct} disabled={busy}>
                    {busy ? 'Working…' : 'Deactivate'}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => void run(() => updateProduct(id, { isActive: true }), 'Product reactivated.')}
                    disabled={busy}
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
            <CardLabel>Saved</CardLabel>
            <p className="mt-xs text-body-md">{notice}</p>
          </Card>
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-3">
        <Card tone="obsidian">
          <CardLabel>{product.sku}</CardLabel>
          <p className="mt-xs text-headline-lg">{product.name}</p>
          <p className="text-body-sm text-obsidian-muted">
            {product.category.name} ·{' '}
            {product.isSubscription
              ? `Subscription, billed ${product.recurringCycle ? humanise(product.recurringCycle).toLowerCase() : ''}`
              : 'One-time sale'}
          </p>
          {!product.isActive && (
            <p className="mt-sm">
              <Badge variant="critical">Deactivated</Badge>
            </p>
          )}
          {product.description && (
            <p className="mt-sm text-body-sm text-obsidian-muted">{product.description}</p>
          )}
        </Card>

        <Card>
          <CardLabel>List price</CardLabel>
          <CardMetric>{money(product.listPrice)}</CardMetric>
          <p className="text-body-sm text-ink-subtle">unit cost {money(product.unitCost)}</p>
        </Card>

        <Card>
          <CardLabel>On quotations</CardLabel>
          <CardMetric>{product.usageCount}</CardMetric>
          <p className="text-body-sm text-ink-subtle">
            {product.usageCount > 0
              ? 'lines reference it, so it is deactivated rather than deleted'
              : 'nothing references it yet'}
          </p>
        </Card>
      </div>

      {draft && (
        <div className="mb-lg">
          <Card>
            <CardLabel>Edit product</CardLabel>
            <div className="mt-md grid gap-md md:grid-cols-2">
              <LabelledField label="Name">
                <input
                  className={FIELD_CLASS}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="SKU">
                <input
                  className={FIELD_CLASS}
                  value={draft.sku}
                  onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Category">
                <select
                  aria-label="Category"
                  className={FIELD_CLASS}
                  value={draft.categoryId}
                  onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </LabelledField>
              <LabelledField label="Description">
                <input
                  className={FIELD_CLASS}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  placeholder="What this product is"
                />
              </LabelledField>
              <LabelledField label="List price">
                <input
                  type="number"
                  min={0}
                  className={`${FIELD_CLASS} tabular`}
                  value={draft.listPrice}
                  onChange={(event) => setDraft({ ...draft, listPrice: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Unit cost">
                <input
                  type="number"
                  min={0}
                  className={`${FIELD_CLASS} tabular`}
                  value={draft.unitCost}
                  onChange={(event) => setDraft({ ...draft, unitCost: event.target.value })}
                />
              </LabelledField>
            </div>

            <div className="mt-md flex flex-wrap items-center gap-md">
              <label className="flex items-center gap-xs text-body-sm text-ink-body">
                <input
                  type="checkbox"
                  checked={draft.isSubscription}
                  onChange={(event) => setDraft({ ...draft, isSubscription: event.target.checked })}
                  className="h-4 w-4 accent-lemon"
                />
                Sold as a subscription
              </label>

              {draft.isSubscription && (
                <label className="flex items-center gap-xs text-body-sm text-ink-body">
                  Billing cycle
                  <select
                    aria-label="Billing cycle"
                    className={FIELD_CLASS}
                    value={draft.recurringCycle}
                    onChange={(event) => setDraft({ ...draft, recurringCycle: event.target.value })}
                  >
                    {CYCLES.map((cycle) => (
                      <option key={cycle.value} value={cycle.value}>
                        {cycle.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </Card>
        </div>
      )}

      <TableShell className="mb-lg">
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Variants</h2>
            <p className="text-body-sm text-ink-subtle">
              Each variant adds its extra price on top of the list price.
            </p>
          </div>
        </TableToolbar>

        {product.variants.length === 0 ? (
          <div className="p-lg">
            <EmptyCard message="No variants — this product is sold as one configuration." />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Variant</Th>
                <Th>SKU</Th>
                <Th className="text-right">Extra price</Th>
                <Th className="text-right">Effective price</Th>
                <Th>Status</Th>
                {isAdmin && <Th />}
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => {
                const editing = variantDraft?.id === variant.id;

                return (
                  <Tr key={variant.id}>
                    <Td className="font-semibold text-ink">
                      {editing ? (
                        <input
                          className={FIELD_CLASS}
                          aria-label={`Name for ${variant.sku}`}
                          value={variantDraft.name}
                          onChange={(event) =>
                            setVariantDraft({ ...variantDraft, name: event.target.value })
                          }
                        />
                      ) : (
                        variant.name
                      )}
                    </Td>
                    <Td>{variant.sku}</Td>
                    <Td numeric>
                      {editing ? (
                        <input
                          type="number"
                          min={0}
                          className={`${FIELD_CLASS} tabular`}
                          aria-label={`Extra price for ${variant.sku}`}
                          value={variantDraft.extraPrice}
                          onChange={(event) =>
                            setVariantDraft({ ...variantDraft, extraPrice: event.target.value })
                          }
                        />
                      ) : (
                        money(variant.extraPrice)
                      )}
                    </Td>
                    <Td numeric>{money(Number(product.listPrice) + Number(variant.extraPrice))}</Td>
                    <Td>
                      {variant.isActive ? (
                        <span className="text-body-sm text-ink-subtle">Active</span>
                      ) : (
                        <Badge variant="critical">Deactivated</Badge>
                      )}
                    </Td>
                    {isAdmin && (
                      <Td>
                        <div className="flex items-center justify-end gap-xs">
                          {editing ? (
                            <>
                              <Button variant="secondary" onClick={handleSaveVariant} disabled={busy}>
                                Save
                              </Button>
                              <Button variant="ghost" onClick={() => setVariantDraft(null)} disabled={busy}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                onClick={() =>
                                  setVariantDraft({
                                    id: variant.id,
                                    name: variant.name,
                                    extraPrice: variant.extraPrice,
                                  })
                                }
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => void handleDeleteVariant(variant)}
                                disabled={busy}
                              >
                                Remove
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

        {isAdmin && (
          <div className="border-t border-white/60 p-lg">
            <p className="mb-sm text-title-sm text-ink">Add a variant</p>
            <div className="grid gap-sm md:grid-cols-[1fr_1fr_8rem_auto]">
              <input
                className={FIELD_CLASS}
                aria-label="New variant name"
                placeholder="16GB / 512GB"
                value={newVariant.name}
                onChange={(event) => setNewVariant({ ...newVariant, name: event.target.value })}
              />
              <input
                className={FIELD_CLASS}
                aria-label="New variant SKU"
                placeholder="HW-DOCK-01-EU"
                value={newVariant.sku}
                onChange={(event) => setNewVariant({ ...newVariant, sku: event.target.value })}
              />
              <input
                type="number"
                min={0}
                className={`${FIELD_CLASS} tabular`}
                aria-label="New variant extra price"
                value={newVariant.extraPrice}
                onChange={(event) => setNewVariant({ ...newVariant, extraPrice: event.target.value })}
              />
              <Button
                variant="secondary"
                onClick={handleAddVariant}
                disabled={busy || !newVariant.name.trim() || !newVariant.sku.trim()}
              >
                Add variant
              </Button>
            </div>
          </div>
        )}
      </TableShell>

      <div className="grid gap-gutter lg:grid-cols-2">
        <TableShell>
          <TableToolbar>
            <div>
              <h2 className="text-title-md text-ink">Stock by warehouse</h2>
              <p className="text-body-sm text-ink-subtle">What fulfillment can draw on today.</p>
            </div>
          </TableToolbar>

          {product.stock.length === 0 ? (
            <div className="p-lg">
              <EmptyCard message="Not stock tracked — nothing to ship for this product." />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Warehouse</Th>
                  <Th className="text-right">On hand</Th>
                  <Th className="text-right">Reserved</Th>
                  <Th className="text-right">Available</Th>
                </tr>
              </thead>
              <tbody>
                {product.stock.map((row) => (
                  <Tr key={row.warehouseId}>
                    <Td className="font-semibold text-ink">{row.warehouseName}</Td>
                    <Td numeric>{Number(row.onHand)}</Td>
                    <Td numeric>{Number(row.reserved)}</Td>
                    <Td numeric>{Number(row.available)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </TableShell>

        <TableShell>
          <TableToolbar>
            <div>
              <h2 className="text-title-md text-ink">Price list entries</h2>
              <p className="text-body-sm text-ink-subtle">Tier and currency pricing for this product.</p>
            </div>
          </TableToolbar>

          {product.priceListEntries.length === 0 ? (
            <div className="p-lg">
              <EmptyCard message="No price list entries — this product sells at its list price." />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Price list</Th>
                  <Th>Applies to</Th>
                  <Th className="text-right">Unit price</Th>
                  <Th className="text-right">Min qty</Th>
                </tr>
              </thead>
              <tbody>
                {product.priceListEntries.map((entry) => (
                  <Tr key={entry.id}>
                    <Td className="font-semibold text-ink">
                      <span className="block">{entry.priceListName}</span>
                      <span className="block text-label-md font-normal text-ink-subtle">
                        {entry.priceListCode} · {entry.currency}
                      </span>
                    </Td>
                    <Td>{entry.variantName ?? 'All variants'}</Td>
                    <Td numeric>{money(entry.unitPrice)}</Td>
                    <Td numeric>{Number(entry.minQuantity)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </TableShell>
      </div>

      <p className="mt-lg text-body-sm text-ink-subtle">Last updated {dateTime(product.updatedAt)}</p>
    </InternalLayout>
  );
}
