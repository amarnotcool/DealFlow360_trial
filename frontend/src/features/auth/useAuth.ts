import { useContext } from 'react';

import { AuthContext } from '../../context/AuthContext';
import type { AuthContextValue } from '../../context/AuthContext';

/** The signed-in user and the two session actions. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }

  return value;
}
