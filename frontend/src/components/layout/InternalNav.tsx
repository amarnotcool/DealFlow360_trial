import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

import { cn } from '../ui/cn';

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  /** Screens whose module has not been built yet render as disabled triggers. */
  enabled: boolean;
}

/** Single-stroke glyphs, drawn inline so the rail carries no icon dependency. */
function Glyph({ d }: { d: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

// Nav items follow specs.md §6.
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', enabled: false, icon: <Glyph d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z" /> },
  { label: 'Quotations', to: '/quotations', enabled: true, icon: <Glyph d="M7 4h7l4 4v12H7zM14 4v4h4M10 13h6M10 17h4" /> },
  { label: 'Approvals', to: '/approvals', enabled: true, icon: <Glyph d="M4 12l5 5L20 6" /> },
  { label: 'Fulfillment', to: '/fulfillment', enabled: true, icon: <Glyph d="M3 8h11v9H3zM14 11h4l3 3v3h-7zM7 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /> },
  { label: 'Subscriptions', to: '/subscriptions', enabled: false, icon: <Glyph d="M4 12a8 8 0 0113.7-5.6M20 12a8 8 0 01-13.7 5.6M18 4v4h-4M6 20v-4h4" /> },
  { label: 'Invoices', to: '/invoices', enabled: false, icon: <Glyph d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /> },
  { label: 'Deal Health', to: '/deal-health', enabled: false, icon: <Glyph d="M3 12h4l2 6 4-14 2 8h6" /> },
  { label: 'Reports', to: '/reports', enabled: false, icon: <Glyph d="M4 20V9M10 20V4M16 20v-7M22 20H2" /> },
  { label: 'Products', to: '/products', enabled: false, icon: <Glyph d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" /> },
];

const PILL_BASE =
  'flex h-11 w-11 items-center justify-center rounded-full transition-all duration-150';

export function InternalNav() {
  return (
    <nav
      aria-label="Internal navigation"
      className="frost-rail sticky top-lg ml-lg flex w-rail shrink-0 flex-col items-center gap-xs rounded-xl py-lg"
    >
      <span className="mb-sm flex h-10 w-10 items-center justify-center rounded-full bg-obsidian text-label-xs text-lemon">
        DF
      </span>

      {NAV_ITEMS.map((item) =>
        item.enabled ? (
          <NavLink
            key={item.label}
            to={item.to}
            title={item.label}
            aria-label={item.label}
            className={({ isActive }) =>
              cn(
                PILL_BASE,
                isActive
                  ? 'bg-lemon text-obsidian shadow-glow-lemon'
                  : 'text-ink-body hover:-translate-y-px hover:bg-white/70',
              )
            }
          >
            {item.icon}
          </NavLink>
        ) : (
          <span
            key={item.label}
            title={`${item.label} — not built yet`}
            aria-label={`${item.label}, not available yet`}
            aria-disabled="true"
            className={cn(PILL_BASE, 'cursor-not-allowed text-ink-subtle/45')}
          >
            {item.icon}
          </span>
        ),
      )}
    </nav>
  );
}
