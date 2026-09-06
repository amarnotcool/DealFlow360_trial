// The action bar's bell: what is waiting for the signed-in user, and one click
// to the screen it is waiting on.
//
// The list comes from three endpoints the app already serves (see
// useNotifications) — there is no notification store behind it, so a section
// only appears for a role that can open the screen it points at.

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, IconButton } from '../ui';
import { useAuth } from '../../features/auth/useAuth';
import { useNotifications } from '../../features/notifications/useNotifications';
import { cn } from '../ui/cn';

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { sections, count, reload } = useNotifications(user?.role ?? null, user?.id ?? null);

  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // Clicking anywhere else, or pressing Escape, closes the panel.
  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: MouseEvent) {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Re-read on open: the queue moves while the screen sits there.
    if (next) void reload();
  }

  function go(to: string) {
    setOpen(false);
    navigate(to);
  }

  const label = count > 0 ? `Notifications, ${count} waiting` : 'Notifications, nothing waiting';

  return (
    <div ref={wrapper} className="relative">
      <IconButton label={label} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6M13.7 20a2 2 0 01-3.4 0" strokeLinecap="round" />
        </svg>
      </IconButton>

      {count > 0 && (
        <span
          aria-hidden
          className="tabular pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-obsidian px-1 text-label-xs text-lemon"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="frost absolute right-0 top-12 z-20 w-[22rem] rounded-vessel p-md shadow-floating"
        >
          {sections === null ? (
            <p className="text-body-sm text-ink-subtle">Loading…</p>
          ) : count === 0 ? (
            <div>
              <p className="text-title-sm text-ink">All caught up</p>
              <p className="mt-2xs text-body-sm text-ink-subtle">
                Nothing is waiting on you right now.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-md">
              {sections
                .filter((section) => section.total > 0)
                .map((section) => (
                  <section key={section.kind}>
                    <button
                      type="button"
                      onClick={() => go(section.to)}
                      className="flex w-full items-center justify-between gap-xs rounded-md px-2xs py-2xs text-left hover:bg-white/60"
                    >
                      <span className="text-label-md text-ink-subtle">{section.label}</span>
                      <Badge variant="neutral">{section.total}</Badge>
                    </button>

                    <ul className="mt-2xs flex flex-col">
                      {section.items.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => go(item.to)}
                            className={cn(
                              'w-full rounded-md px-2xs py-xs text-left transition-colors',
                              'hover:bg-white/70',
                            )}
                          >
                            <span className="block truncate text-body-md text-ink">
                              {item.title}
                            </span>
                            <span className="block truncate text-body-sm text-ink-subtle">
                              {item.detail}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>

                    {section.total > section.items.length && (
                      <button
                        type="button"
                        onClick={() => go(section.to)}
                        className="mt-2xs px-2xs text-body-sm text-ink-subtle underline hover:text-ink"
                      >
                        {section.total - section.items.length} more
                      </button>
                    )}
                  </section>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
