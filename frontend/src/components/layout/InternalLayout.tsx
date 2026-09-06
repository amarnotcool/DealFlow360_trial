import type { ReactNode } from 'react';

import { InternalNav } from './InternalNav';
import { NotificationBell } from './NotificationBell';

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
        {/* Sticky action bar: sticks at the same offset as the rail (top-lg),
            which is also the page's own top padding — so it locks with zero
            jump. Sticky, not fixed, so it keeps its flow space and content
            never slides underneath it. The frost keeps scrolled rows from
            ghosting through. */}
        <header className="frost sticky top-lg z-10 mb-lg flex flex-wrap items-center justify-between gap-md rounded-vessel px-lg py-md">
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
            {actions}
            <NotificationBell />
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}
