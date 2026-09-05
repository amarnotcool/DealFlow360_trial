// Route guards. These mirror the backend's role guards — the API refuses the
// same things on its own, so a guard here is convenience, never the only check.

import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { RoleCode } from '@dealflow360/shared';

import { LoadingCard } from '../components/ui';
import { useAuth } from '../features/auth/useAuth';

/** Sends a signed-out visitor to the login page, remembering where they were. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="p-xl">
        <LoadingCard label="Session" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/** A screen a role has no business on sends them back to their own start page. */
export function RequireRole({ allow, children }: { allow: RoleCode[]; children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return <RequireAuth>{children}</RequireAuth>;
  }

  if (!allow.includes(user.role)) {
    return <Navigate to="/quotations" replace />;
  }

  return <>{children}</>;
}
