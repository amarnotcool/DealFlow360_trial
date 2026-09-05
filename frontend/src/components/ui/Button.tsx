import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

type ButtonVariant = 'primary' | 'secondary' | 'obsidian' | 'ghost';

const BASE =
  'inline-flex items-center justify-center gap-xs rounded-full text-title-sm transition-all duration-150 ' +
  'disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-obsidian/25 hover:-translate-y-px';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // Primary pill action: lemon fill, dark slate text, expanding chartreuse glow.
  primary: 'bg-lemon text-obsidian shadow-glow-lemon hover:shadow-glow-lemon-hover',
  // Secondary glass action.
  secondary: 'bg-white/85 text-ink border border-white/90 shadow-floating hover:bg-white',
  obsidian: 'bg-obsidian text-white shadow-depth-obsidian hover:bg-obsidian/90',
  ghost: 'text-ink-body hover:bg-white/60',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(BASE, 'px-[1.25rem] py-[0.625rem]', VARIANT_CLASS[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

/** 40x40 floating utility button with a delicate 1px border. */
export function IconButton({ label, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        BASE,
        'h-10 w-10 shrink-0 bg-white/90 text-ink border border-white shadow-floating hover:bg-white',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
