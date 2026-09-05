// One customer: its tier, the people who speak for it, and every quotation
// raised against it.
//
// Removing a contact is the API's decision, not this screen's: it deletes one
// nothing has used and deactivates one quotations or negotiations point at,
// and says which it did. The screen reports that answer.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  ApiError,
  CustomerContactView,
  CustomerDetailView,
  CustomerTierView,
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
  addContact,
  deleteContact,
  fetchCustomer,
  fetchCustomerTiers,
  updateContact,
  updateCustomer,
} from '../../../features/customers/customers.api';
import { date, dateTime, humanise, money, percent } from '../../../lib/format';
import { CUSTOMER_WRITE_ROLES } from '../../../routes/access';

interface EditDraft {
  name: string;
  customerTierId: string;
  email: string;
  phone: string;
  billingAddress: string;
  shippingAddress: string;
}

function toDraft(customer: CustomerDetailView): EditDraft {
  return {
    name: customer.name,
    customerTierId: customer.customerTier.id,
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    billingAddress: customer.billingAddress ?? '',
    shippingAddress: customer.shippingAddress ?? '',
  };
}

interface ContactDraft {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  /** Blank leaves portal access as it is; a value sets or replaces it. */
  portalPassword: string;
}

const BLANK_CONTACT = { fullName: '', email: '', phone: '', isPrimary: false, portalPassword: '' };

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user ? CUSTOMER_WRITE_ROLES.includes(user.role) : false;

  const [customer, setCustomer] = useState<CustomerDetailView | null>(null);
  const [tiers, setTiers] = useState<CustomerTierView[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactDraft | null>(null);
  const [newContact, setNewContact] = useState(BLANK_CONTACT);
  const [addingContact, setAddingContact] = useState(false);

  const load = useCallback(async () => {
    const response = await fetchCustomer(id);
    setCustomer(response.data);
    setError(response.error);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (canWrite) void fetchCustomerTiers().then((response) => setTiers(response.data ?? []));
  }, [canWrite]);

  /** Runs one mutation, then re-renders from whatever the server sent back. */
  async function run(
    action: () => Promise<{ data: CustomerDetailView | null; error: ApiError | null }>,
    message: string,
  ) {
    setBusy(true);
    setError(null);
    const response = await action();
    setBusy(false);

    if (response.data) {
      setCustomer(response.data);
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
        updateCustomer(id, {
          name: draft.name.trim(),
          customerTierId: draft.customerTierId,
          email: draft.email.trim() || null,
          phone: draft.phone.trim() || null,
          billingAddress: draft.billingAddress.trim() || null,
          shippingAddress: draft.shippingAddress.trim() || null,
        }),
      'Customer saved.',
    );

    if (saved) setDraft(null);
  }

  async function handleAddContact() {
    const added = await run(
      () =>
        addContact(id, {
          fullName: newContact.fullName.trim(),
          email: newContact.email.trim(),
          phone: newContact.phone.trim() || null,
          isPrimary: newContact.isPrimary,
          portalPassword: newContact.portalPassword.trim() || null,
        }),
      'Contact added.',
    );

    if (added) {
      setNewContact(BLANK_CONTACT);
      setAddingContact(false);
    }
  }

  async function handleSaveContact() {
    if (!contactDraft) return;

    const saved = await run(
      () =>
        updateContact(id, contactDraft.id, {
          fullName: contactDraft.fullName.trim(),
          email: contactDraft.email.trim(),
          phone: contactDraft.phone.trim() || null,
          isPrimary: contactDraft.isPrimary,
          // Left blank, portal access is untouched.
          ...(contactDraft.portalPassword.trim()
            ? { portalPassword: contactDraft.portalPassword.trim() }
            : {}),
        }),
      'Contact saved.',
    );

    if (saved) setContactDraft(null);
  }

  async function handleRevokePortal(contact: CustomerContactView) {
    await run(
      () => updateContact(id, contact.id, { portalPassword: null }),
      `Portal access revoked for ${contact.fullName} — any open portal session ends.`,
    );
  }

  async function handleRemoveContact(contact: CustomerContactView) {
    setBusy(true);
    setError(null);
    const response = await deleteContact(id, contact.id);
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    setNotice(
      response.data.outcome === 'DELETED'
        ? `${contact.fullName} removed — nothing referenced this contact.`
        : `${contact.fullName} deactivated — quotations still reference this contact, so the record is kept.`,
    );
    setCustomer(response.data.customer);
  }

  if (error && !customer) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Customers']} title="Customer">
        <ErrorCard error={error} />
      </InternalLayout>
    );
  }

  if (!customer) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Customers']} title="Customer">
        <LoadingCard label="Customer" />
      </InternalLayout>
    );
  }

  return (
    <InternalLayout
      breadcrumb={['DealFlow360', 'Customers']}
      title={customer.name}
      actions={
        canWrite ? (
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
                <Button onClick={() => setDraft(toDraft(customer))}>Edit</Button>
                {customer.isActive ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => updateCustomer(id, { isActive: false }),
                        'Customer deactivated — its quotations and history are kept.',
                      )
                    }
                  >
                    {busy ? 'Working…' : 'Deactivate'}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() => updateCustomer(id, { isActive: true }), 'Customer reactivated.')
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
            <CardLabel>Saved</CardLabel>
            <p className="mt-xs text-body-md">{notice}</p>
          </Card>
        </div>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-3">
        <Card tone="obsidian">
          <CardLabel>{customer.code}</CardLabel>
          <p className="mt-xs text-headline-lg">{customer.name}</p>
          <p className="text-body-sm text-obsidian-muted">
            {customer.customerTier.name} tier · discount ceiling{' '}
            {percent(customer.customerTier.ceilingPct)}
          </p>
          <p className="mt-xs text-body-sm text-obsidian-muted">
            Owned by {customer.accountOwner?.fullName ?? 'nobody yet'}
          </p>
          {!customer.isActive && (
            <p className="mt-sm">
              <Badge variant="critical">Deactivated</Badge>
            </p>
          )}
        </Card>

        <Card>
          <CardLabel>Quotations</CardLabel>
          <CardMetric>{customer.quotationCount}</CardMetric>
          <p className="text-body-sm text-ink-subtle">
            {customer.quotationCount > 0 ? 'raised against this account' : 'nothing raised yet'}
          </p>
        </Card>

        <Card>
          <CardLabel>Reach</CardLabel>
          <p className="mt-xs text-body-md text-ink-body">{customer.email ?? 'No account email'}</p>
          <p className="text-body-sm text-ink-subtle">{customer.phone ?? 'No phone on file'}</p>
          <p className="mt-sm text-body-sm text-ink-subtle">
            {customer.billingAddress ?? 'No billing address on file'}
          </p>
          {customer.shippingAddress && (
            <p className="text-body-sm text-ink-subtle">Ships to {customer.shippingAddress}</p>
          )}
        </Card>
      </div>

      {draft && (
        <div className="mb-lg">
          <Card>
            <CardLabel>Edit customer</CardLabel>
            <div className="mt-md grid gap-md md:grid-cols-2">
              <LabelledField label="Company name">
                <input
                  className={FIELD_CLASS}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Tier">
                <select
                  aria-label="Tier"
                  className={FIELD_CLASS}
                  value={draft.customerTierId}
                  onChange={(event) => setDraft({ ...draft, customerTierId: event.target.value })}
                >
                  {tiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.name} — ceiling {percent(tier.ceilingPct)}
                    </option>
                  ))}
                </select>
              </LabelledField>
              <LabelledField label="Account email">
                <input
                  className={FIELD_CLASS}
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  placeholder="accounts@example.test"
                />
              </LabelledField>
              <LabelledField label="Phone">
                <input
                  className={FIELD_CLASS}
                  value={draft.phone}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Billing address">
                <input
                  className={FIELD_CLASS}
                  value={draft.billingAddress}
                  onChange={(event) => setDraft({ ...draft, billingAddress: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Shipping address">
                <input
                  className={FIELD_CLASS}
                  value={draft.shippingAddress}
                  onChange={(event) => setDraft({ ...draft, shippingAddress: event.target.value })}
                />
              </LabelledField>
            </div>
            <p className="mt-sm text-body-sm text-ink-subtle">
              Changing the tier changes the discount ceiling every future quote for this customer is
              scored against.
            </p>
          </Card>
        </div>
      )}

      <TableShell className="mb-lg">
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Contacts</h2>
            <p className="text-body-sm text-ink-subtle">
              A contact with portal access can sign in and negotiate on the customer portal.
            </p>
          </div>
          {canWrite && (
            <Button variant="secondary" onClick={() => setAddingContact((open) => !open)}>
              {addingContact ? 'Close' : 'Add contact'}
            </Button>
          )}
        </TableToolbar>

        {customer.contacts.length === 0 ? (
          <div className="p-lg">
            <EmptyCard message="No contacts on file — nobody can sign in to the portal for this account yet." />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Contact</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Portal</Th>
                <Th>Status</Th>
                {canWrite && <Th />}
              </tr>
            </thead>
            <tbody>
              {customer.contacts.map((contact) => (
                <Tr key={contact.id}>
                  <Td className="font-semibold text-ink">
                    <span className="block">{contact.fullName}</span>
                    {contact.isPrimary && (
                      <span className="block text-label-md font-normal text-ink-subtle">
                        Primary contact
                      </span>
                    )}
                  </Td>
                  <Td>{contact.email}</Td>
                  <Td className="text-ink-subtle">{contact.phone ?? '—'}</Td>
                  <Td>
                    {contact.hasPortalAccess ? (
                      <Badge variant="info">
                        Portal access
                        {contact.portalLastLoginAt
                          ? ` · ${date(contact.portalLastLoginAt)}`
                          : ' · never signed in'}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">No portal access</Badge>
                    )}
                  </Td>
                  <Td>
                    {contact.isActive ? (
                      <span className="text-body-sm text-ink-subtle">Active</span>
                    ) : (
                      <Badge variant="critical">Deactivated</Badge>
                    )}
                  </Td>
                  {canWrite && (
                    <Td>
                      <div className="flex items-center justify-end gap-xs">
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setContactDraft({
                              id: contact.id,
                              fullName: contact.fullName,
                              email: contact.email,
                              phone: contact.phone ?? '',
                              isPrimary: contact.isPrimary,
                              portalPassword: '',
                            })
                          }
                        >
                          Edit
                        </Button>
                        {contact.hasPortalAccess && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void handleRevokePortal(contact)}
                          >
                            Revoke portal
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void handleRemoveContact(contact)}
                        >
                          Remove
                        </Button>
                      </div>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        {canWrite && contactDraft && (
          <div className="border-t border-white/60 p-lg">
            <p className="mb-sm text-title-sm text-ink">Edit contact</p>
            <div className="grid gap-md md:grid-cols-4">
              <LabelledField label="Name">
                <input
                  className={FIELD_CLASS}
                  value={contactDraft.fullName}
                  onChange={(event) =>
                    setContactDraft({ ...contactDraft, fullName: event.target.value })
                  }
                />
              </LabelledField>
              <LabelledField label="Email">
                <input
                  className={FIELD_CLASS}
                  value={contactDraft.email}
                  onChange={(event) => setContactDraft({ ...contactDraft, email: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Phone">
                <input
                  className={FIELD_CLASS}
                  value={contactDraft.phone}
                  onChange={(event) => setContactDraft({ ...contactDraft, phone: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="New portal password">
                <input
                  type="password"
                  className={FIELD_CLASS}
                  value={contactDraft.portalPassword}
                  placeholder="Leave blank to keep as is"
                  onChange={(event) =>
                    setContactDraft({ ...contactDraft, portalPassword: event.target.value })
                  }
                />
              </LabelledField>
            </div>
            <div className="mt-md flex flex-wrap items-center gap-md">
              <label className="flex items-center gap-xs text-body-sm text-ink-body">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-lemon"
                  checked={contactDraft.isPrimary}
                  onChange={(event) =>
                    setContactDraft({ ...contactDraft, isPrimary: event.target.checked })
                  }
                />
                Primary contact
              </label>
              <Button onClick={handleSaveContact} disabled={busy}>
                {busy ? 'Saving…' : 'Save contact'}
              </Button>
              <Button variant="secondary" onClick={() => setContactDraft(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {canWrite && addingContact && (
          <div className="border-t border-white/60 p-lg">
            <p className="mb-sm text-title-sm text-ink">Add a contact</p>
            <div className="grid gap-md md:grid-cols-4">
              <LabelledField label="Name">
                <input
                  className={FIELD_CLASS}
                  placeholder="Gita Rao"
                  value={newContact.fullName}
                  onChange={(event) => setNewContact({ ...newContact, fullName: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Email">
                <input
                  className={FIELD_CLASS}
                  placeholder="gita@globex.test"
                  value={newContact.email}
                  onChange={(event) => setNewContact({ ...newContact, email: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Phone (optional)">
                <input
                  className={FIELD_CLASS}
                  value={newContact.phone}
                  onChange={(event) => setNewContact({ ...newContact, phone: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Portal password (optional)">
                <input
                  type="password"
                  className={FIELD_CLASS}
                  placeholder="At least 8 characters"
                  value={newContact.portalPassword}
                  onChange={(event) =>
                    setNewContact({ ...newContact, portalPassword: event.target.value })
                  }
                />
              </LabelledField>
            </div>
            <div className="mt-md flex flex-wrap items-center gap-md">
              <label className="flex items-center gap-xs text-body-sm text-ink-body">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-lemon"
                  checked={newContact.isPrimary}
                  onChange={(event) =>
                    setNewContact({ ...newContact, isPrimary: event.target.checked })
                  }
                />
                Make this the primary contact
              </label>
              <Button
                onClick={handleAddContact}
                disabled={busy || !newContact.fullName.trim() || !newContact.email.trim()}
              >
                {busy ? 'Adding…' : 'Add contact'}
              </Button>
            </div>
          </div>
        )}
      </TableShell>

      <TableShell>
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">Quotations</h2>
            <p className="text-body-sm text-ink-subtle">Everything raised against this account.</p>
          </div>
          <Badge variant="neutral">
            {customer.quotationCount} on this account
          </Badge>
        </TableToolbar>

        {customer.quotations.length === 0 ? (
          <div className="p-lg">
            <EmptyCard message="No quotations for this customer yet." />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Status</Th>
                <Th className="text-right">Total</Th>
                <Th>Raised</Th>
              </tr>
            </thead>
            <tbody>
              {customer.quotations.map((quotation) => (
                <Tr
                  key={quotation.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/quotations/${quotation.id}`)}
                >
                  <Td className="font-semibold text-ink">{quotation.number}</Td>
                  <Td>
                    <Badge variant="neutral">{humanise(quotation.status)}</Badge>
                  </Td>
                  <Td numeric>{money(quotation.total)}</Td>
                  <Td className="text-ink-subtle">{date(quotation.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableShell>

      <p className="mt-lg text-body-sm text-ink-subtle">Last updated {dateTime(customer.updatedAt)}</p>
    </InternalLayout>
  );
}
