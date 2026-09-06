// The workspace's left rail.
//
// DESIGN.md's rail is a slim 72px frosted column of pill-shaped icon triggers.
// Icons alone are quick once you know them and opaque until you do, so the rail
// opens to show every label — two ways, which behave differently on purpose:
//
//   hover   the rail opens while the pointer is on it, and closes when it
//           leaves.
//   pin     the rail stays open with the pointer anywhere, until it is unpinned.
//
// In BOTH states the rail keeps its real width in the layout, so the page
// beside it moves over and narrows to match. It never floats above the content:
// an overlay would cover the page title, the filter pills and the left edge of
// every table — the reader would lose exactly the part of the screen they were
// pointing at. Rail and content animate the same 200ms, so the shift reads as
// one movement rather than two.

import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import type { ReactNode } from "react";
import type { RoleCode } from "@dealflow360/shared";

import { useAuth } from "../../features/auth/useAuth";
import { useNavRail } from "../../context/NavContext";
import {
  ADMIN_ONLY,
  ALL_ROLES,
  APPROVALS_ROLES,
  BILLING_ROLES,
  DISCOUNT_CONFIG_ROLES,
  REPORTING_ROLES,
} from "../../routes/access";
import { cn } from "../ui/cn";

/** DESIGN.md's rail width, and what it opens to. */
const COLLAPSED_PX = 72;
const EXPANDED_PX = 220;

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
      className="h-5 w-5 shrink-0"
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
  {
    label: "Dashboard",
    to: "/dashboard",
    enabled: true,
    roles: ALL_ROLES,
    icon: <Glyph d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z" />,
  },
  {
    label: "Quotations",
    to: "/quotations",
    enabled: true,
    roles: ALL_ROLES,
    icon: <Glyph d="M7 4h7l4 4v12H7zM14 4v4h4M10 13h6M10 17h4" />,
  },
  {
    label: "Approvals",
    to: "/approvals",
    enabled: true,
    roles: APPROVALS_ROLES,
    icon: <Glyph d="M4 12l5 5L20 6" />,
  },
  {
    label: "Fulfillment",
    to: "/fulfillment",
    enabled: true,
    roles: ALL_ROLES,
    icon: (
      <Glyph d="M3 8h11v9H3zM14 11h4l3 3v3h-7zM7 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
    ),
  },
  {
    label: "Subscriptions",
    to: "/subscriptions",
    enabled: true,
    roles: BILLING_ROLES,
    icon: (
      <Glyph d="M4 12a8 8 0 0113.7-5.6M20 12a8 8 0 01-13.7 5.6M18 4v4h-4M6 20v-4h4" />
    ),
  },
  {
    label: "Invoices",
    to: "/invoices",
    enabled: true,
    roles: BILLING_ROLES,
    icon: <Glyph d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />,
  },
  {
    label: "Deal Health",
    to: "/deal-health",
    enabled: true,
    roles: APPROVALS_ROLES,
    icon: <Glyph d="M3 12h4l2 6 4-14 2 8h6" />,
  },
  {
    label: "Reports",
    to: "/reports",
    enabled: true,
    roles: REPORTING_ROLES,
    icon: <Glyph d="M4 20V9M10 20V4M16 20v-7M22 20H2" />,
  },
  {
    label: "Products",
    to: "/products",
    enabled: true,
    roles: ALL_ROLES,
    icon: (
      <Glyph d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />
    ),
  },
  {
    label: "Warehouses",
    to: "/warehouses",
    enabled: true,
    roles: ALL_ROLES,
    icon: <Glyph d="M3 10.5 12 4l9 6.5V20H3zM9 20v-6h6v6" />,
  },
  {
    label: "Customers",
    to: "/customers",
    enabled: true,
    roles: ALL_ROLES,
    icon: (
      <Glyph d="M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM22 20v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8" />
    ),
  },
  {
    label: "Discount Tiers",
    to: "/discount-tiers",
    enabled: true,
    roles: DISCOUNT_CONFIG_ROLES,
    icon: (
      <Glyph d="M8 16 16 8M9 9h.01M15 15h.01M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
    ),
  },
  {
    label: "Staff Users",
    to: "/users",
    enabled: true,
    roles: ADMIN_ONLY,
    icon: (
      <Glyph d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1M18 8h4M20 6v4" />
    ),
  },
];

/**
 * A pill is 44px tall in both states. Collapsed it is a 44px square centred in
 * the rail; open it keeps the same left edge and grows to the right, so the
 * icons never move sideways as the label arrives.
 */
const PILL_BASE =
  "flex h-11 w-full items-center gap-sm rounded-full px-[0.8125rem] transition-colors duration-150";

/** Two initials for the signed-in user, e.g. Farah Finance becomes FF. */
function initials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * The label beside an icon. It is always in the DOM — so the rail is one list
 * to a screen reader in either state — and only fades and un-clips visually.
 */
function Label({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "min-w-0 truncate text-title-sm transition-opacity duration-150",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {children}
    </span>
  );
}

export function InternalNav() {
  const { user, signOut } = useAuth();
  const { pinned, togglePinned } = useNavRail();
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const open = pinned || hovered;

  // The footprint follows the panel exactly — open or closed, hovered or
  // pinned. That is what pushes the content across instead of covering it.
  const width = open ? EXPANDED_PX : COLLAPSED_PX;

  // A role only sees the screens it can actually open; the same list guards the
  // routes, and the API refuses the endpoints behind them regardless.
  const items = NAV_ITEMS.filter((item) =>
    user ? item.roles.includes(user.role) : false,
  );

  return (
    <div
      className="ml-lg shrink-0 transition-[width] duration-200 ease-out"
      style={{ width }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* The sticky point matches the page's own top padding, so the rail locks
          with zero jump — the same offset the action bar uses.

          The stacking order lives here, not on the <nav>: z-index only applies
          to a positioned element, and this wrapper is the positioned one. The
          rail no longer overlaps the page, but the action bar above it is
          sticky too, and this keeps the rail's rounded edge in front of it. */}
      <div className="sticky top-lg z-40">
        <nav
          aria-label="Internal navigation"
          data-open={open ? "true" : "false"}
          className={cn(
            "frost-rail flex w-full flex-col gap-xs overflow-hidden rounded-xl px-md py-lg",
            "h-[calc(100vh-3rem)] transition-[width] duration-200 ease-out",
          )}
        >
          <div className="mb-sm flex h-10 w-full items-center gap-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-obsidian text-label-xs text-lemon">
              DF
            </span>
            <Label open={open}>DealFlow360</Label>
          </div>

          {/* The list scrolls on its own so a short viewport clips nothing; the
              rail itself stays clipped, which is what animates the width. */}
          <div className="flex min-h-0 flex-1 flex-col gap-xs overflow-y-auto overflow-x-hidden">
            {items.map((item) =>
              item.enabled ? (
                <NavLink
                  key={item.label}
                  to={item.to}
                  title={open ? undefined : item.label}
                  className={({ isActive }) =>
                    cn(
                      PILL_BASE,
                      isActive
                        ? "bg-lemon text-obsidian shadow-glow-lemon"
                        : "text-ink-body hover:bg-white/70",
                    )
                  }
                >
                  {item.icon}
                  <Label open={open}>{item.label}</Label>
                </NavLink>
              ) : (
                <span
                  key={item.label}
                  title={`${item.label} — not built yet`}
                  aria-disabled="true"
                  className={cn(
                    PILL_BASE,
                    "cursor-not-allowed text-ink-subtle/45",
                  )}
                >
                  {item.icon}
                  <Label open={open}>{item.label}</Label>
                </span>
              ),
            )}
          </div>

          {user && (
            <div className="flex flex-col gap-xs pt-lg">
              <button
                type="button"
                aria-pressed={pinned}
                aria-label={
                  pinned ? "Unpin the navigation" : "Keep the navigation open"
                }
                title={
                  pinned ? "Unpin the navigation" : "Keep the navigation open"
                }
                onClick={togglePinned}
                className={cn(
                  PILL_BASE,
                  pinned
                    ? "bg-white/80 text-ink shadow-floating"
                    : "text-ink-body hover:bg-white/70",
                )}
              >
                {/* The chevron points the way the rail will move on click. */}
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className={cn(
                    "h-5 w-5 shrink-0 transition-transform duration-200",
                    pinned && "rotate-180",
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 6l6 6-6 6M4 4v16" />
                </svg>
                <Label open={open}>{pinned ? "Unpin" : "Keep open"}</Label>
              </button>

              <div
                className={cn(PILL_BASE, "cursor-default")}
                title={`${user.fullName} · ${user.role.replace("_", " ").toLowerCase()}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/85 text-label-xs text-ink">
                  {initials(user.fullName)}
                </span>
                <span
                  className={cn(
                    "min-w-0 transition-opacity duration-150",
                    open ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  <span className="block truncate text-title-sm text-ink">
                    {user.fullName}
                  </span>
                  <span className="block truncate text-label-md text-ink-subtle">
                    {user.role.replace("_", " ").toLowerCase()}
                  </span>
                </span>
              </div>

              <button
                type="button"
                title="Sign out"
                aria-label="Sign out"
                onClick={() => {
                  signOut();
                  navigate("/login", { replace: true });
                }}
                className={cn(PILL_BASE, "text-ink-body hover:bg-white/70")}
              >
                <Glyph d="M15 12H4m0 0 3-3m-3 3 3 3M12 4h6a2 2 0 012 2v12a2 2 0 01-2 2h-6" />
                <Label open={open}>Sign out</Label>
              </button>
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
