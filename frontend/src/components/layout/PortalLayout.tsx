import type { ReactNode } from 'react';

import { PortalNav } from './PortalNav';

export interface PortalLayoutProps {
  title: string;
  subtitle?: string;
  /** Contextual controls for the current screen. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * The customer's shell: its own top nav, no internal rail, no internal search.
 * Same visual language as the workspace, none of its vocabulary.
 */
export function PortalLayout({ title, subtitle, actions, children }: PortalLayoutProps) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[72rem] px-lg py-lg">
      <PortalNav />

      <div className="mb-lg flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="text-headline-lg text-ink">{title}</h1>
          {subtitle && <p className="mt-2xs text-body-md text-ink-subtle">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-sm">{actions}</div>}
      </div>

      <main>{children}</main>
    </div>
  );
}
