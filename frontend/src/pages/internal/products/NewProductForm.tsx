// The admin's create form for the catalogue (screen 16).
//
// Variants are entered inline because the API creates them with the product in
// one call — a product and its variants are one thing to an admin, not two.

import { useState } from 'react';
import type { ApiError, CategoryView, ProductDetailView } from '@dealflow360/shared';

import { Button, Card, CardLabel, ErrorCard } from '../../../components/ui';
import { createProduct } from '../../../features/products/products.api';
import type { ProductVariantInput } from '../../../features/products/products.api';
import { CYCLES, FIELD_CLASS, LabelledField } from './form-fields';

interface Props {
  categories: CategoryView[];
  onCreated: (product: ProductDetailView) => void;
  onCancel: () => void;
}

export function NewProductForm({ categories, onCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [description, setDescription] = useState('');
  const [isSubscription, setIsSubscription] = useState(false);
  const [recurringCycle, setRecurringCycle] = useState<string>('MONTHLY');
  const [variants, setVariants] = useState<ProductVariantInput[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const ready =
    name.trim().length > 0 &&
    sku.trim().length > 0 &&
    categoryId.length > 0 &&
    listPrice.trim().length > 0 &&
    variants.every((variant) => variant.sku.trim() && variant.name.trim());

  function updateVariant(index: number, patch: Partial<ProductVariantInput>) {
    setVariants((current) =>
      current.map((variant, position) => (position === index ? { ...variant, ...patch } : variant)),
    );
  }

  async function handleCreate() {
    setBusy(true);
    setError(null);

    const response = await createProduct({
      sku: sku.trim(),
      name: name.trim(),
      categoryId,
      description: description.trim() || null,
      listPrice: Number(listPrice),
      unitCost: Number(unitCost || 0),
      isSubscription,
      recurringCycle: isSubscription ? recurringCycle : null,
      variants: variants.map((variant) => ({
        sku: variant.sku.trim(),
        name: variant.name.trim(),
        extraPrice: Number(variant.extraPrice || 0),
      })),
    });

    setBusy(false);

    if (response.data) {
      onCreated(response.data);
      return;
    }
    setError(response.error);
  }

  return (
    <Card>
      <CardLabel>New product</CardLabel>

      <div className="mt-md grid gap-md md:grid-cols-2">
        <LabelledField label="Name">
          <input
            className={FIELD_CLASS}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Docking Station"
          />
        </LabelledField>

        <LabelledField label="SKU">
          <input
            className={FIELD_CLASS}
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            placeholder="HW-DOCK-01"
          />
        </LabelledField>

        <LabelledField label="Category">
          <select
            aria-label="Category"
            className={FIELD_CLASS}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </LabelledField>

        <LabelledField label="Description (optional)">
          <input
            className={FIELD_CLASS}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this product is"
          />
        </LabelledField>

        <LabelledField label="List price">
          <input
            type="number"
            min={0}
            className={`${FIELD_CLASS} tabular`}
            value={listPrice}
            onChange={(event) => setListPrice(event.target.value)}
            placeholder="12000"
          />
        </LabelledField>

        <LabelledField label="Unit cost">
          <input
            type="number"
            min={0}
            className={`${FIELD_CLASS} tabular`}
            value={unitCost}
            onChange={(event) => setUnitCost(event.target.value)}
            placeholder="8000"
          />
        </LabelledField>
      </div>

      <div className="mt-md flex flex-wrap items-center gap-md">
        <label className="flex items-center gap-xs text-body-sm text-ink-body">
          <input
            type="checkbox"
            checked={isSubscription}
            onChange={(event) => setIsSubscription(event.target.checked)}
            className="h-4 w-4 accent-lemon"
          />
          Sold as a subscription
        </label>

        {isSubscription && (
          <label className="flex items-center gap-xs text-body-sm text-ink-body">
            Billing cycle
            <select
              aria-label="Billing cycle"
              className={FIELD_CLASS}
              value={recurringCycle}
              onChange={(event) => setRecurringCycle(event.target.value)}
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

      <div className="mt-lg">
        <div className="flex items-center justify-between gap-sm">
          <p className="text-title-sm text-ink">Variants</p>
          <Button
            variant="secondary"
            onClick={() => setVariants((current) => [...current, { sku: '', name: '', extraPrice: 0 }])}
          >
            Add variant
          </Button>
        </div>

        {variants.length === 0 ? (
          <p className="mt-xs text-body-sm text-ink-subtle">
            No variants — the product is sold as one configuration.
          </p>
        ) : (
          <div className="mt-sm flex flex-col gap-sm">
            {variants.map((variant, index) => (
              <div key={index} className="grid gap-sm md:grid-cols-[1fr_1fr_8rem_auto]">
                <input
                  className={FIELD_CLASS}
                  value={variant.name}
                  aria-label={`Variant ${index + 1} name`}
                  onChange={(event) => updateVariant(index, { name: event.target.value })}
                  placeholder="16GB / 512GB"
                />
                <input
                  className={FIELD_CLASS}
                  value={variant.sku}
                  aria-label={`Variant ${index + 1} SKU`}
                  onChange={(event) => updateVariant(index, { sku: event.target.value })}
                  placeholder="HW-DOCK-01-EU"
                />
                <input
                  type="number"
                  min={0}
                  className={`${FIELD_CLASS} tabular`}
                  value={variant.extraPrice}
                  aria-label={`Variant ${index + 1} extra price`}
                  onChange={(event) => updateVariant(index, { extraPrice: Number(event.target.value) })}
                />
                <Button
                  variant="ghost"
                  onClick={() => setVariants((current) => current.filter((_, position) => position !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-md">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mt-lg flex items-center gap-sm">
        <Button onClick={handleCreate} disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create Product'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
