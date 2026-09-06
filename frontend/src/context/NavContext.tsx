// Whether the internal nav rail is pinned open.
//
// It lives above the routes because every screen renders its own
// `<InternalLayout>`, so a rail that held this in its own state would forget the
// choice on the next navigation. It is in-memory on purpose: a pin is a "for
// now" preference, not something to carry across sessions.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface NavContextValue {
  /** True while the rail stays open without the pointer on it. */
  pinned: boolean;
  togglePinned: () => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [pinned, setPinned] = useState(false);

  const togglePinned = useCallback(() => setPinned((current) => !current), []);
  const value = useMemo(() => ({ pinned, togglePinned }), [pinned, togglePinned]);

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNavRail(): NavContextValue {
  const value = useContext(NavContext);

  if (!value) {
    throw new Error('useNavRail must be used inside <NavProvider>');
  }

  return value;
}
