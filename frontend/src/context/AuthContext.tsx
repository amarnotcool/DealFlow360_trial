// The signed-in staff user, for the whole internal workspace.
//
// There is exactly one source of the acting user: this session. No screen picks
// an actor any more, and no request body carries one — the API reads it from the
// token, so the audit log always names whoever was signed in.

import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiError, AuthUser } from '@dealflow360/shared';

import { fetchMe, login as loginRequest } from '../features/auth/auth.api';
import { SESSION_EXPIRED_EVENT, getAuthToken, setAuthToken } from '../lib/api-client';

export interface AuthContextValue {
  user: AuthUser | null;
  /** True until the stored token has been checked, so guards do not flicker. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<ApiError | null>;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  // A token from a previous page load is only trusted once /auth/me confirms it.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!getAuthToken()) {
        setLoading(false);
        return;
      }

      const response = await fetchMe();
      if (cancelled) return;

      if (response.data) setUser(response.data);
      else setAuthToken(null);
      setLoading(false);
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // An expired or rejected token anywhere in the app ends the session here.
  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await loginRequest(email, password);

    if (!response.data) {
      return response.error;
    }

    setAuthToken(response.data.token);
    setUser(response.data.user);
    return null;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
