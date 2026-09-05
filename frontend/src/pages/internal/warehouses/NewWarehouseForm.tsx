// The admin's create form for the warehouse network.
//
// The shipping cost weight is what the split allocator minimises against, so
// the form says what the number does rather than leaving it as a bare field.

import { useState } from 'react';
import type { ApiError, WarehouseDetailView } from '@dealflow360/shared';

import {
  Button,
  Card,
  CardLabel,
  ErrorCard,
  FIELD_CLASS,
  LabelledField,
} from '../../../components/ui';
import { createWarehouse } from '../../../features/warehouses/warehouses.api';

interface Props {
  onCreated: (warehouse: WarehouseDetailView) => void;
  onCancel: () => void;
}

export function NewWarehouseForm({ onCreated, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [shippingCostWeight, setShippingCostWeight] = useState('1');
  const [priority, setPriority] = useState('0');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = code.trim().length > 0 && name.trim().length > 0;

  async function handleCreate() {
    setBusy(true);
    setError(null);

    const response = await createWarehouse({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      address: address.trim() || null,
      shippingCostWeight: Number(shippingCostWeight || 1),
      priority: Number(priority || 0),
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
      <CardLabel>New warehouse</CardLabel>
      <p className="mt-xs text-body-sm text-ink-subtle">
        A new warehouse starts empty — receive stock into it before a split can draw on it.
      </p>

      <div className="mt-md grid gap-md md:grid-cols-2">
        <LabelledField label="Code">
          <input
            className={FIELD_CLASS}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="WH-BENGALURU"
          />
        </LabelledField>

        <LabelledField label="Name">
          <input
            className={FIELD_CLASS}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="WH-Bengaluru"
          />
        </LabelledField>

        <LabelledField label="Address (optional)">
          <input
            className={FIELD_CLASS}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Whitefield, Bengaluru 560066"
          />
        </LabelledField>

        <LabelledField label="Shipping cost weight">
          <input
            type="number"
            min={0.01}
            step={0.05}
            className={`${FIELD_CLASS} tabular`}
            value={shippingCostWeight}
            onChange={(event) => setShippingCostWeight(event.target.value)}
          />
        </LabelledField>

        <LabelledField label="Priority">
          <input
            type="number"
            min={0}
            className={`${FIELD_CLASS} tabular`}
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          />
        </LabelledField>
      </div>

      <p className="mt-sm text-body-sm text-ink-subtle">
        The split allocator ships from the cheapest weight first; priority breaks a tie between two
        equally good warehouses, lowest first.
      </p>

      {error && (
        <div className="mt-md">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mt-lg flex items-center gap-sm">
        <Button onClick={handleCreate} disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create Warehouse'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
