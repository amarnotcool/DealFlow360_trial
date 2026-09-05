// Customer portal sign-in. A separate door from the staff login: a different
// session, a different token, and a different place to land afterwards.

import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { FormEvent } from 'react';
import type { ApiError } from '@dealflow360/shared';

import { Button, Card } from '../../components/ui';
import { usePortalAuth } from '../../features/auth/usePortalAuth';

const FIELD_CLASS =
  'frost-input w-full rounded-full px-md py-[0.6rem] text-body-md text-ink-body ' +
  'placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60';

export default function PortalLogin() {
  const { contact, signIn } = usePortalAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  if (contact) {
    return <Navigate to="/portal" replace />;
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
    navigate(from && from !== '/portal/login' ? from : '/portal', { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-lg">
      <div className="w-full max-w-[26rem]">
        <div className="mb-lg flex items-center gap-sm">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-obsidian text-label-xs text-lemon">
            DF
          </span>
          <div>
            <p className="text-label-md text-ink-subtle">DealFlow360 · Customer portal</p>
            <h1 className="text-headline-lg text-ink">Welcome back</h1>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-md">
            <label className="flex flex-col gap-2xs">
              <span className="text-label-md text-ink-subtle">Email</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@yourcompany.com"
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

        <p className="mt-md text-body-sm text-ink-subtle">
          Your account manager sets up portal access. Contact them if you cannot sign in.
        </p>
      </div>
    </div>
  );
}
