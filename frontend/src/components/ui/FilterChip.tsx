// A filter you can see all of at once.
//
// Where a filter has two or three mutually exclusive values — or where the
// options carry a number worth reading without opening anything, as the deal
// health board's alert counts do — the choices stay on screen as chips rather
// than folding into a dropdown.
//
// A chip deliberately carries no chevron. It opens nothing, and the chevron on
// `FilterPill` is what tells you that pill does.

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

export interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * The parameter name, for a chip that stands alone (e.g. a Status toggle
   * reading "Status: Active"). Chips in a `FilterChipGroup` leave this off —
   * the group names them once.
   */
  label?: string;
  active?: boolean;
  /** A trailing figure, e.g. how many alerts are of this type. */
  count?: ReactNode;
  children: ReactNode;
}

export function FilterChip({
  label,
  active = false,
  count,
  className,
  children,
  ...rest
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-xs rounded-full px-md py-[0.5rem] text-body-sm transition-all duration-150',
        'shadow-floating hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian/25',
        active
          ? 'bg-lemon text-obsidian'
          : 'border border-white/90 bg-white/85 text-ink-body hover:bg-white',
        className,
      )}
      {...rest}
    >
      {label && <span className={active ? 'text-obsidian/70' : 'text-ink-subtle'}>{label}:</span>}
      <span className={active ? 'font-semibold' : undefined}>{children}</span>
      {count !== undefined && (
        <span
          className={cn(
            'tabular rounded-full px-xs text-label-md',
            active ? 'bg-obsidian/10 text-obsidian' : 'bg-ink/5 text-ink-subtle',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export interface FilterChipGroupProps {
  /** Names the whole row once, instead of every chip repeating it. */
  label: string;
  /** Hide the visible caption where the surrounding copy already says it. */
  showLabel?: boolean;
  className?: string;
  children: ReactNode;
}

export function FilterChipGroup({
  label,
  showLabel = true,
  className,
  children,
}: FilterChipGroupProps) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap items-center gap-xs', className)}>
      {showLabel && <span className="text-label-md text-ink-subtle">{label}</span>}
      {children}
    </div>
  );
}
