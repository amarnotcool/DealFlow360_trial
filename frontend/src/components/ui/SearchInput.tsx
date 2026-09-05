import type { InputHTMLAttributes } from 'react';

import { cn } from './cn';

/** 44px frosted global search pill with an inner search glyph. */
export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-md h-4 w-4 text-ink-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="9" cy="9" r="6" />
        <path d="M13.5 13.5 17 17" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        className={cn(
          'frost-input h-11 w-full rounded-full pl-[2.5rem] pr-md text-body-md text-ink-body',
          'placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60',
        )}
        {...rest}
      />
    </div>
  );
}
