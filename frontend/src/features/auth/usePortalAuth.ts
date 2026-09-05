import { useContext } from 'react';

import { PortalAuthContext } from '../../context/PortalAuthContext';
import type { PortalAuthContextValue } from '../../context/PortalAuthContext';

/** The signed-in customer contact and the two portal session actions. */
export function usePortalAuth(): PortalAuthContextValue {
  const value = useContext(PortalAuthContext);

  if (!value) {
    throw new Error('usePortalAuth must be used inside <PortalAuthProvider>');
  }

  return value;
}
