import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

export type BadgeVariant = 'critical' | 'info' | 'neutral' | 'primary' | 'dark';

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  // High demand / critical warning: tangerine with dark slate type.
  critical: 'bg-tangerine text-obsidian',
  // Low demand / stable / informational: electric sky with white type.
  info: 'bg-sky text-white',
  // Neutral / delay tracking: glass pill.
  neutral: 'bg-white/75 text-ink-body border border-white/90',
  primary: 'bg-lemon text-obsidian',
  dark: 'bg-obsidian text-white',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Leading dot, used by the neutral delay-tracking pill. */
  dot?: boolean;
  children: ReactNode;
}

export function Badge({ variant = 'neutral', dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2xs rounded-full px-sm py-[0.25rem] text-label-md whitespace-nowrap',
        VARIANT_CLASS[variant],
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-tangerine" />}
      {children}
    </span>
  );
}

/** Risk levels map onto the badge triad: HIGH tangerine, MEDIUM lemon, NONE sky. */
export const RISK_BADGE_VARIANT = {
  HIGH: 'critical',
  MEDIUM: 'primary',
  NONE: 'info',
} as const satisfies Record<'HIGH' | 'MEDIUM' | 'NONE', BadgeVariant>;

export function RiskBadge({ level, score }: { level: keyof typeof RISK_BADGE_VARIANT; score?: number | string }) {
  return (
    <Badge variant={RISK_BADGE_VARIANT[level]}>
      {level}
      {score !== undefined && <span className="tabular opacity-70">{score}</span>}
    </Badge>
  );
}
