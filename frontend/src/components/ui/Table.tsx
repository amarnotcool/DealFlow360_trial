import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

import { cn } from './cn';

/** Frosted 28px vessel that a table sits inside. */
export function TableShell({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('frost overflow-hidden rounded-vessel', className)} {...rest}>
      {children}
    </div>
  );
}

/** Title row above the grid, holding filter pills and utility actions. */
export function TableToolbar({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-between gap-md px-lg pt-lg pb-md', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-body-md', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-lg py-sm text-left text-label-md font-medium uppercase text-ink-subtle',
        'border-b border-hairline',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligns and tabular-aligns a monetary or metric column. */
  numeric?: boolean;
}

export function Td({ numeric = false, className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        'px-lg py-md text-ink-body border-b border-hairline',
        numeric && 'tabular text-right',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors hover:bg-white/50', className)} {...rest}>
      {children}
    </tr>
  );
}

/** Rounded 18px dark backing used behind a product thumbnail in a row. */
export function Thumb({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-thumb bg-obsidian text-label-xs text-white">
      {children}
    </span>
  );
}

/** Overflow triple-dot utility trigger on a row. */
export function RowMenuButton({ label = 'Row actions' }: { label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="rounded-full px-xs py-2xs text-ink-subtle transition-colors hover:bg-white/70 hover:text-ink"
    >
      &#8943;
    </button>
  );
}

/** Soft 6px checkbox matching the brand border characteristics. */
export function Checkbox({ className, ...rest }: HTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'h-4 w-4 rounded-[6px] border border-ink/20 bg-white/80 accent-lemon',
        'focus:outline-none focus:ring-2 focus:ring-lemon/60',
        className,
      )}
      {...rest}
    />
  );
}
