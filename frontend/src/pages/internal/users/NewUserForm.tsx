// An admin creates a staff account and types its first password.
// There is no signup and no reset flow — this form is the only way in.

import { useState } from 'react';
import type { ApiError, RoleCode, RoleView, StaffUserDetailView } from '@dealflow360/shared';

import {
  Button,
  Card,
  CardLabel,
  ErrorCard,
  FIELD_CLASS,
  LabelledField,
} from '../../../components/ui';
import { createUser } from '../../../features/users/users.api';

interface Props {
  roles: RoleView[];
  onCreated: (user: StaffUserDetailView) => void;
  onCancel: () => void;
}

export function NewUserForm({ roles, onCreated, onCancel }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const ready =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    role.length > 0;

  async function handleCreate() {
    setBusy(true);
    setError(null);

    const response = await createUser({
      fullName: fullName.trim(),
      email: email.trim(),
      password,
      role: role as RoleCode,
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
      <CardLabel>New staff account</CardLabel>
      <p className="mt-xs text-body-sm text-ink-subtle">
        The password you set here is the one this person signs in with — pass it to them yourself.
      </p>

      <div className="mt-md grid gap-md md:grid-cols-2">
        <LabelledField label="Full name">
          <input
            className={FIELD_CLASS}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Nadia Sharma"
          />
        </LabelledField>

        <LabelledField label="Email">
          <input
            className={FIELD_CLASS}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nadia@dealflow360.test"
          />
        </LabelledField>

        <LabelledField label="Role">
          <select
            aria-label="Role"
            className={FIELD_CLASS}
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">Choose a role</option>
            {roles.map((option) => (
              <option key={option.id} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </LabelledField>

        <LabelledField label="Password">
          <input
            type="password"
            className={FIELD_CLASS}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
          />
        </LabelledField>
      </div>

      {error && (
        <div className="mt-md">
          <ErrorCard error={error} />
        </div>
      )}

      <div className="mt-lg flex items-center gap-sm">
        <Button onClick={handleCreate} disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create User'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
