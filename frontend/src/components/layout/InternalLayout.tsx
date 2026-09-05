import type { ReactNode } from 'react';

import { IconButton, SearchInput } from '../ui';
import { InternalNav } from './InternalNav';

export interface InternalLayoutProps {
  /** Breadcrumb trail, most general first. */
  breadcrumb?: string[];
  title: string;
  /** Contextual controls for the current screen, rendered in the action bar. */
  actions?: ReactNode;
  children: ReactNode;
}

/** Frosted rail on the left, action bar on top, content beneath. */
export function InternalLayout({ breadcrumb = [], title, actions, children }: InternalLayoutProps) {
  return (
    <div className="flex min-h-screen gap-lg py-lg pr-xl">
      <InternalNav />

      <div className="min-w-0 flex-1">
        <header className="mb-lg flex flex-wrap items-center justify-between gap-md">
          <div className="min-w-0">
            {breadcrumb.length > 0 && (
              <p className="mb-2xs flex items-center gap-2xs text-label-md text-ink-subtle">
                {breadcrumb.map((crumb, index) => (
                  <span key={crumb} className="flex items-center gap-2xs">
                    {index > 0 && <span aria-hidden>/</span>}
                    {crumb}
                  </span>
                ))}
              </p>
            )}
            <h1 className="text-headline-lg text-ink">{title}</h1>
          </div>

          <div className="flex items-center gap-sm">
            <SearchInput placeholder="Search quotes, customers, SKUs" className="w-[18rem] max-w-full" />
            {actions}
            <IconButton label="Notifications">
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 20a2 2 0 01-3.4 0" strokeLinecap="round" />
              </svg>
            </IconButton>
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}
