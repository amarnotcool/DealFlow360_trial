import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { RoleCode } from '@dealflow360/shared';

import { useAuth } from '../../features/auth/useAuth';
import { ADMIN_ONLY, ALL_ROLES, APPROVALS_ROLES, BILLING_ROLES, REPORTING_ROLES } from '../../routes/access';
import { cn } from '../ui/cn';

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  /** Screens whose module has not been built yet render as disabled triggers. */
  enabled: boolean;
  /** Roles that reach this screen — an item outside the role is not rendered. */
  roles: RoleCode[];
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
  { label: 'Dashboard', to: '/dashboard', enabled: true, roles: ALL_ROLES, icon: <Glyph d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z" /> },
  { label: 'Quotations', to: '/quotations', enabled: true, roles: ALL_ROLES, icon: <Glyph d="M7 4h7l4 4v12H7zM14 4v4h4M10 13h6M10 17h4" /> },
  { label: 'Approvals', to: '/approvals', enabled: true, roles: APPROVALS_ROLES, icon: <Glyph d="M4 12l5 5L20 6" /> },
  { label: 'Fulfillment', to: '/fulfillment', enabled: true, roles: ALL_ROLES, icon: <Glyph d="M3 8h11v9H3zM14 11h4l3 3v3h-7zM7 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /> },
  { label: 'Subscriptions', to: '/subscriptions', enabled: true, roles: BILLING_ROLES, icon: <Glyph d="M4 12a8 8 0 0113.7-5.6M20 12a8 8 0 01-13.7 5.6M18 4v4h-4M6 20v-4h4" /> },
  { label: 'Invoices', to: '/invoices', enabled: true, roles: BILLING_ROLES, icon: <Glyph d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /> },
  { label: 'Deal Health', to: '/deal-health', enabled: true, roles: APPROVALS_ROLES, icon: <Glyph d="M3 12h4l2 6 4-14 2 8h6" /> },
  { label: 'Reports', to: '/reports', enabled: true, roles: REPORTING_ROLES, icon: <Glyph d="M4 20V9M10 20V4M16 20v-7M22 20H2" /> },
  { label: 'Products', to: '/products', enabled: true, roles: ALL_ROLES, icon: <Glyph d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" /> },
  { label: 'Warehouses', to: '/warehouses', enabled: true, roles: ALL_ROLES, icon: <Glyph d="M3 10.5 12 4l9 6.5V20H3zM9 20v-6h6v6" /> },
  { label: 'Customers', to: '/customers', enabled: true, roles: ALL_ROLES, icon: <Glyph d="M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM22 20v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" /> },
  { label: 'Staff Users', to: '/users', enabled: true, roles: ADMIN_ONLY, icon: <Glyph d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1M18 8h4M20 6v4" /> },
];

const PILL_BASE =
  'flex h-11 w-11 items-center justify-center rounded-full transition-all duration-150';

/** Two initials for the signed-in user, e.g. Farah Finance becomes FF. */
function initials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function InternalNav() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // A role only sees the screens it can actually open; the same list guards the
  // routes, and the API refuses the endpoints behind them regardless.
  const items = NAV_ITEMS.filter((item) => (user ? item.roles.includes(user.role) : false));

  return (
    <nav
      aria-label="Internal navigation"
      className="frost-rail sticky top-lg ml-lg flex w-rail shrink-0 flex-col items-center gap-xs rounded-xl py-lg"
    >
      <span className="mb-sm flex h-10 w-10 items-center justify-center rounded-full bg-obsidian text-label-xs text-lemon">
        DF
      </span>

      {items.map((item) =>
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

      {user && (
        <div className="mt-auto flex flex-col items-center gap-xs pt-lg">
          <span
            title={`${user.fullName} · ${user.role.replace('_', ' ').toLowerCase()}`}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-label-xs text-ink"
          >
            {initials(user.fullName)}
          </span>
          <button
            type="button"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => {
              signOut();
              navigate('/login', { replace: true });
            }}
            className={cn(PILL_BASE, 'text-ink-body hover:-translate-y-px hover:bg-white/70')}
          >
            <Glyph d="M15 12H4m0 0 3-3m-3 3 3 3M12 4h6a2 2 0 012 2v12a2 2 0 01-2 2h-6" />
          </button>
        </div>
      )}
    </nav>
  );
}
