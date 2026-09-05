import { NavLink } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

import { usePortalAuth } from '../../features/auth/usePortalAuth';
import { cn } from '../ui/cn';

/** specs.md screen 11: the portal has its own three-item nav, not the rail. */
const PORTAL_NAV = [
  { label: 'My Quotation', to: '/portal/quotations' },
  { label: 'Messages', to: '/portal/messages' },
  { label: 'Profile', to: '/portal/profile' },
];

export function PortalNav() {
  const { contact, signOut } = usePortalAuth();
  const navigate = useNavigate();

  return (
    <header className="frost-rail mb-lg flex flex-wrap items-center justify-between gap-md rounded-vessel px-lg py-md">
      <div className="flex items-center gap-md">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-obsidian text-label-xs text-lemon">
          DF
        </span>
        <nav aria-label="Portal navigation" className="flex items-center gap-2xs">
          {PORTAL_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
