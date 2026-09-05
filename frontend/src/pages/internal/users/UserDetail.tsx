// One staff account: its role, and the work that would outlive it.
//
// An account is never deleted — quotations it owns and approvals it decided
// point at it. Deactivation stops the login and keeps the trail, and the API
// refuses an admin who tries it on their own account; that refusal is shown
// here as a message, not swallowed.

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type {
  ApiError,
  RoleCode,
  RoleView,
  StaffUserDetailView,
} from '@dealflow360/shared';

import { InternalLayout } from '../../../components/layout/InternalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  ErrorCard,
  FIELD_CLASS,
  LabelledField,
  LoadingCard,
} from '../../../components/ui';
import { useAuth } from '../../../features/auth/useAuth';
import {
  deactivateUser,
  fetchRoles,
  fetchUser,
  updateUser,
} from '../../../features/users/users.api';
import { dateTime } from '../../../lib/format';

interface EditDraft {
  fullName: string;
  email: string;
  role: RoleCode;
  /** Blank leaves the password alone; a value replaces it and ends open sessions. */
  password: string;
}

function toDraft(user: StaffUserDetailView): EditDraft {
  return { fullName: user.fullName, email: user.email, role: user.role, password: '' };
}

export default function UserDetail() {
  const { id = '' } = useParams();
  const { user: signedIn } = useAuth();

  const [staff, setStaff] = useState<StaffUserDetailView | null>(null);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  const isSelf = signedIn?.id === id;

  const load = useCallback(async () => {
    const response = await fetchUser(id);
    setStaff(response.data);
    setError(response.error);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchRoles().then((response) => setRoles(response.data ?? []));
  }, []);

  /** Runs one mutation, then re-renders from whatever the server sent back. */
  async function run(
    action: () => Promise<{ data: StaffUserDetailView | null; error: ApiError | null }>,
    message: string,
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const response = await action();
    setBusy(false);

    if (response.data) {
      setStaff(response.data);
      setNotice(message);
      return true;
    }
    // A refused change — deactivating yourself, or an email already in use —
    // comes back as a typed error and is shown as one.
    setError(response.error);
    return false;
  }

  async function handleSave() {
    if (!draft) return;

    const saved = await run(
      () =>
        updateUser(id, {
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          role: draft.role,
          ...(draft.password ? { password: draft.password } : {}),
        }),
      draft.password
        ? 'Account saved — the new password ends any session it still had open.'
        : 'Account saved.',
    );

    if (saved) setDraft(null);
  }

  if (error && !staff) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Staff users']} title="Staff user">
        <ErrorCard error={error} />
      </InternalLayout>
    );
  }

  if (!staff) {
    return (
      <InternalLayout breadcrumb={['DealFlow360', 'Staff users']} title="Staff user">
        <LoadingCard label="Staff user" />
      </InternalLayout>
    );
  }

  return (
    <InternalLayout
      breadcrumb={['DealFlow360', 'Staff users']}
      title={staff.fullName}
      actions={
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
              <Button onClick={() => setDraft(toDraft(staff))}>Edit</Button>
              {staff.isActive ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => deactivateUser(id),
                      `${staff.fullName} can no longer sign in — the account's history is kept.`,
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
                    void run(
                      () => updateUser(id, { isActive: true }),
                      `${staff.fullName} can sign in again.`,
                    )
                  }
                >
                  Reactivate
                </Button>
              )}
            </>
          )}
        </div>
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
          <CardLabel>{staff.email}</CardLabel>
          <p className="mt-xs text-headline-lg">{staff.fullName}</p>
          <p className="text-body-sm text-obsidian-muted">
            Signs in as {staff.role.replace('_', ' ').toLowerCase()}
            {isSelf ? ' · this is you' : ''}
          </p>
          {/* The role reads as text here — a dark role pill would vanish into
              this card; the directory carries the coloured pill instead. */}
          {!staff.isActive && (
            <p className="mt-sm">
              <Badge variant="critical">Deactivated</Badge>
            </p>
          )}
        </Card>

        <Card>
          <CardLabel>Owns</CardLabel>
          <CardMetric>{staff.ownedQuotationCount}</CardMetric>
          <p className="text-body-sm text-ink-subtle">
            quotations · {staff.ownedCustomerCount} customer
            {staff.ownedCustomerCount === 1 ? '' : 's'}
          </p>
        </Card>

        <Card>
          <CardLabel>Decided</CardLabel>
          <CardMetric>{staff.decidedApprovalCount}</CardMetric>
          <p className="text-body-sm text-ink-subtle">
            approval steps — the reason the account is deactivated, never deleted
          </p>
        </Card>
      </div>

      {isSelf && (
        <div className="mb-lg">
          <Card>
            <CardLabel>Your own account</CardLabel>
            <p className="mt-xs text-body-md text-ink-body">
              You cannot deactivate yourself or take away your own admin role — an admin who did
              would lock this workspace out of user management. Ask another admin to make either
              change.
            </p>
          </Card>
        </div>
      )}

      {draft && (
        <div className="mb-lg">
          <Card>
            <CardLabel>Edit account</CardLabel>
            <div className="mt-md grid gap-md md:grid-cols-2">
              <LabelledField label="Full name">
                <input
                  className={FIELD_CLASS}
                  value={draft.fullName}
                  onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Email">
                <input
                  className={FIELD_CLASS}
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                />
              </LabelledField>
              <LabelledField label="Role">
                <select
                  aria-label="Role"
                  className={FIELD_CLASS}
                  value={draft.role}
                  onChange={(event) => setDraft({ ...draft, role: event.target.value as RoleCode })}
                >
                  {roles.map((option) => (
                    <option key={option.id} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </LabelledField>
              <LabelledField label="New password">
                <input
                  type="password"
                  className={FIELD_CLASS}
                  value={draft.password}
                  placeholder="Leave blank to keep the current one"
                  onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                />
              </LabelledField>
            </div>
            <p className="mt-sm text-body-sm text-ink-subtle">
              A role change takes effect the next time this person signs in; a new password ends
              every session they have open now.
            </p>
          </Card>
        </div>
      )}

      <Card>
        <CardLabel>Account</CardLabel>
        <p className="mt-xs text-body-md text-ink-body">
          Last login {staff.lastLoginAt ? dateTime(staff.lastLoginAt) : '— never signed in'}
        </p>
        <p className="text-body-sm text-ink-subtle">
          Created {dateTime(staff.createdAt)} · last changed {dateTime(staff.updatedAt)}
        </p>
      </Card>
    </InternalLayout>
  );
}
