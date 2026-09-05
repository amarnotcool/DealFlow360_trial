import type { ButtonHTMLAttributes } from 'react';

import { cn } from './cn';

export interface FilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The parameter name, e.g. "Supplier". */
  label: string;
  /** The active value, e.g. "Jaunt". */
  value: string;
  active?: boolean;
}

/** Floating dropdown trigger showing an active parameter key and its value. */
export function FilterPill({ label, value, active = false, className, ...rest }: FilterPillProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-xs rounded-full px-md py-[0.5rem] text-body-sm transition-all duration-150',
        'hover:-translate-y-px shadow-floating',
        active ? 'bg-lemon text-obsidian' : 'bg-white/85 text-ink-body border border-white/90 hover:bg-white',
        className,
      )}
      {...rest}
    >
      <span className="text-ink-subtle">{label}:</span>
      <span className="font-semibold">{value}</span>
      <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
