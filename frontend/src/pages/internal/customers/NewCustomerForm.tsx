// Creating a customer, with an optional first contact.
//
// The contact is entered inline because the API creates both in one
// transaction — to a rep adding an account mid-quote, the company and the
// person they talk to are one thing, not two.

import { useState } from 'react';
import type { ApiError, CustomerDetailView, CustomerTierView } from '@dealflow360/shared';

import {
  Button,
  Card,
  CardLabel,
  ErrorCard,
  FIELD_CLASS,
  LabelledField,
} from '../../../components/ui';
import { createCustomer } from '../../../features/customers/customers.api';
import { percent } from '../../../lib/format';

interface Props {
  tiers: CustomerTierView[];
  onCreated: (customer: CustomerDetailView) => void;
  onCancel: () => void;
}

export function NewCustomerForm({ tiers, onCreated, onCancel }: Props) {
  const [name, setName] = useState('');
  const [customerTierId, setCustomerTierId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [billingAddress, setBillingAddress] = useState('');

  const [withContact, setWithContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [portalPassword, setPortalPassword] = useState('');

  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const ready =
    name.trim().length > 0 &&
    customerTierId.length > 0 &&
    (!withContact || (contactName.trim().length > 0 && contactEmail.trim().length > 0));

  async function handleCreate() {
    setBusy(true);
    setError(null);

    const response = await createCustomer({
      name: name.trim(),
      customerTierId,
      email: email.trim() || null,
      phone: phone.trim() || null,
      billingAddress: billingAddress.trim() || null,
      primaryContact: withContact
        ? {
            fullName: contactName.trim(),
            email: contactEmail.trim(),
            isPrimary: true,
            // Blank means the contact exists on file without portal access.
            portalPassword: portalPassword.trim() || null,
          }
        : undefined,
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
      <CardLabel>New customer</CardLabel>
      <p className="mt-xs text-body-sm text-ink-subtle">
        The account code is derived from the name — you never have to invent one.
      </p>

      <div className="mt-md grid gap-md md:grid-cols-2">
        <LabelledField label="Company name">
          <input
            className={FIELD_CLASS}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Globex Industries"
          />
        </LabelledField>

        <LabelledField label="Tier">
          <select
            aria-label="Tier"
            className={FIELD_CLASS}
            value={customerTierId}
            onChange={(event) => setCustomerTierId(event.target.value)}
          >
            <option value="">Choose a tier</option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.name} — ceiling {percent(tier.ceilingPct)}
              </option>
            ))}
          </select>
        </LabelledField>

        <LabelledField label="Account email (optional)">
          <input
            className={FIELD_CLASS}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="accounts@globex.test"
          />
        </LabelledField>

        <LabelledField label="Phone (optional)">
          <input
            className={FIELD_CLASS}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+91 22 4000 1000"
          />
        </LabelledField>

        <LabelledField label="Billing address (optional)">
          <input
            className={FIELD_CLASS}
            value={billingAddress}
            onChange={(event) => setBillingAddress(event.target.value)}
            placeholder="Andheri East, Mumbai 400069"
          />
        </LabelledField>
      </div>

      <div className="mt-md">
        <label className="flex items-center gap-xs text-body-sm text-ink-body">
          <input
            type="checkbox"
            checked={withContact}
            onChange={(event) => setWithContact(event.target.checked)}
            className="h-4 w-4 accent-lemon"
          />
          Add a primary contact now
        </label>

        {withContact && (
          <div className="mt-sm grid gap-md md:grid-cols-3">
            <LabelledField label="Contact name">
              <input
                className={FIELD_CLASS}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Gita Rao"
              />
            </LabelledField>
            <LabelledField label="Contact email">
              <input
                className={FIELD_CLASS}
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="gita@globex.test"
              />
            </LabelledField>
            <LabelledField label="Portal password (optional)">
              <input
                type="password"
                className={FIELD_CLASS}
                value={portalPassword}
                onChange={(event) => setPortalPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </LabelledField>
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
          {busy ? 'Creating…' : 'Create Customer'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
