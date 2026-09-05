import { NavLink } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

import { usePortalAuth } from '../../features/auth/usePortalAuth';
import { cn } from '../ui/cn';

/** specs.md screen 11: the portal has its own three-item nav, not the rail. */
const PORTAL_NAV: Array<{ label: string; to: string; end?: boolean }> = [
  { label: 'Overview', to: '/portal', end: true },
  { label: 'My Quotation', to: '/portal/quotations' },
  { label: 'Messages', to: '/portal/messages' },
  { label: 'Profile', to: '/portal/profile' },
];

export function PortalNav() {
  const { contact, signOut } = usePortalAuth();
  const navigate = useNavigate();

  return (
    <header className="frost-rail sticky top-lg z-10 mb-lg flex flex-wrap items-center justify-between gap-md rounded-vessel px-lg py-md">
      {/* Sticky for the same reason as the internal action bar: the pill is
          already frosted, so it only needed the stick point. top-lg matches the
          page's own top padding — zero jump when it locks. */}
      <div className="flex items-center gap-md">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-obsidian text-label-xs text-lemon">
          DF
        </span>
        <nav aria-label="Portal navigation" className="flex items-center gap-2xs">
          {PORTAL_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-md py-[0.45rem] text-title-sm transition-all duration-150',
                  isActive
                    ? 'bg-lemon text-obsidian shadow-glow-lemon'
                    : 'text-ink-body hover:-translate-y-px hover:bg-white/70',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-sm">
        {contact && (
          <span className="text-body-sm text-ink-subtle">
            <span className="text-ink">{contact.fullName}</span> · {contact.customerName}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            signOut();
            navigate('/portal/login', { replace: true });
          }}
          className="rounded-full bg-white/85 px-md py-[0.45rem] text-title-sm text-ink
            shadow-floating transition-all duration-150 hover:-translate-y-px hover:bg-white"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
