// The signed-in customer contact, for the portal surface only.
//
// Deliberately a second provider rather than a mode on the internal one: the
// two sessions are separate (CLAUDE.md rule 4), so signing in as staff does
// nothing here, and signing in as a customer does nothing to the workspace.

import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiError, PortalUser } from '@dealflow360/shared';

import { fetchPortalMe, portalLogin } from '../features/portal/portal.api';
import { PORTAL_SESSION_EXPIRED_EVENT, getPortalToken, setPortalToken } from '../lib/api-client';

export interface PortalAuthContextValue {
  contact: PortalUser | null;
  /** True until the stored token has been checked, so guards do not flicker. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<ApiError | null>;
  signOut: () => void;
}

export const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [contact, setContact] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    setPortalToken(null);
    setContact(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!getPortalToken()) {
        setLoading(false);
        return;
      }

      const response = await fetchPortalMe();
      if (cancelled) return;

      if (response.data) setContact(response.data);
      else setPortalToken(null);
      setLoading(false);
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = () => setContact(null);
    window.addEventListener(PORTAL_SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(PORTAL_SESSION_EXPIRED_EVENT, handler);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await portalLogin(email, password);

    if (!response.data) {
      return response.error;
    }

    setPortalToken(response.data.token);
    setContact(response.data.user);
    return null;
  }, []);

  const value = useMemo<PortalAuthContextValue>(
    () => ({ contact, loading, signIn, signOut }),
    [contact, loading, signIn, signOut],
  );

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}
