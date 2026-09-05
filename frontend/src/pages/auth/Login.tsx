// Internal sign-in (specs.md §2 roles, DESIGN.md Level 1 frosted card).
//
// Email and password, and nothing else: there is no SSO, no signup, no reset
// and no second factor behind this app, so none of them are drawn here. The
// role is not something the user picks — it comes back with the session.

import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { FormEvent } from 'react';
import type { ApiError } from '@dealflow360/shared';

import { Button, Card, CardLabel } from '../../components/ui';
import { useAuth } from '../../features/auth/useAuth';

/** The seeded accounts, so a demo does not need the seed file open. */
const SEEDED_LOGINS = [
  { role: 'Sales Rep', email: 'rep@dealflow360.test' },
  { role: 'Sales Manager', email: 'manager@dealflow360.test' },
  { role: 'Finance', email: 'finance@dealflow360.test' },
  { role: 'Admin', email: 'admin@dealflow360.test' },
];

const SEED_PASSWORD = 'dealflow360';

const FIELD_CLASS =
  'frost-input w-full rounded-full px-md py-[0.6rem] text-body-md text-ink-body ' +
  'placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60';

export default function Login() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  // Someone already signed in has no business on this page.
  if (user) {
    return <Navigate to="/quotations" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const failure = await signIn(email.trim(), password);
    setBusy(false);

    if (failure) {
      setError(failure);
      return;
    }

    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/login' ? from : '/quotations', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-lg">
      <div className="w-full max-w-[26rem]">
        <div className="mb-lg flex items-center gap-sm">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-obsidian text-label-xs text-lemon">
            DF
          </span>
          <div>
            <p className="text-label-md text-ink-subtle">DealFlow360</p>
            <h1 className="text-headline-lg text-ink">Sign in</h1>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-md">
            <label className="flex flex-col gap-2xs">
              <span className="text-label-md text-ink-subtle">Work email</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@dealflow360.test"
                className={FIELD_CLASS}
              />
            </label>

            <label className="flex flex-col gap-2xs">
              <span className="text-label-md text-ink-subtle">Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className={FIELD_CLASS}
              />
            </label>

            {error && (
              <p role="alert" className="text-body-sm text-danger">
                {error.message}
              </p>
            )}

            <Button type="submit" variant="obsidian" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </Card>

        <Card className="mt-lg">
          <CardLabel>Seeded accounts</CardLabel>
          <p className="mt-2xs text-body-sm text-ink-subtle">
            Password for all of them is <span className="text-ink">{SEED_PASSWORD}</span>. Pick one to
            fill the form.
          </p>
          <ul className="mt-sm flex flex-col gap-2xs">
            {SEEDED_LOGINS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(SEED_PASSWORD);
                    setError(null);
                  }}
                  className="flex w-full items-baseline justify-between gap-sm rounded-full px-sm py-2xs
                    text-left text-body-sm transition-colors hover:bg-white/60"
                >
                  <span className="text-ink">{account.role}</span>
                  <span className="text-ink-subtle">{account.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
