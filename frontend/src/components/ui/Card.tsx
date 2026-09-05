import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

type CardTone = 'frost' | 'lemon' | 'tangerine' | 'obsidian';

const TONE_CLASS: Record<CardTone, string> = {
  // Level 1 substrate
  frost: 'frost text-ink-body',
  // Level 2 high-contrast metric blocks
  lemon: 'bg-lemon text-obsidian border border-lemon-soft shadow-glow-lemon',
  tangerine: 'bg-tangerine text-obsidian border border-tangerine shadow-glow-tangerine',
  obsidian: 'bg-obsidian text-white border border-white/10 shadow-depth-obsidian',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  children: ReactNode;
}

export function Card({ tone = 'frost', className, children, ...rest }: CardProps) {
  return (
    <div className={cn('rounded-vessel p-lg', TONE_CLASS[tone], className)} {...rest}>
      {children}
    </div>
  );
}

/** Small caps label above a metric or section title. */
export function CardLabel({ className, children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-label-xs uppercase opacity-70', className)} {...rest}>
      {children}
    </p>
  );
}

export function CardMetric({ className, children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('tabular text-display-xl', className)} {...rest}>
      {children}
    </p>
  );
}
