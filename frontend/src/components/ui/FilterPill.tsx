// The dropdown filter pill DESIGN.md describes: a floating trigger showing the
// parameter key and its active value with an inline chevron, opening a menu of
// the values it can take.
//
// It was previously rendered once per option, which made a row of six triggers
// that each carried a chevron opening nothing and repeated "Stage:" six times.
// One pill, one key, one menu — the chevron now means what it looks like.
//
// Use `FilterChip` instead where the choice is a two- or three-way toggle worth
// keeping on screen at a glance; a chip carries no chevron precisely because it
// opens nothing.

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from './cn';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  /** Optional trailing note, e.g. a count. */
  hint?: ReactNode;
}

export interface FilterPillProps<T extends string> {
  /** The parameter name, e.g. "Stage". Shown once, on the trigger. */
  label: string;
  /** The selected option's value. */
  value: T;
  options: Array<FilterOption<T>>;
  onChange: (value: T) => void;
  /** Which value counts as "no filter", so the pill reads as inactive on it. */
  neutralValue?: T;
  className?: string;
}

export function FilterPill<T extends string>({
  label,
  value,
  options,
  onChange,
  neutralValue,
  className,
}: FilterPillProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];
  // Filtering to "All" is not a filter, so the pill should not look applied.
  const active = neutralValue === undefined ? true : value !== neutralValue;

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: MouseEvent) {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Opening lands on the current choice, so arrow keys move from where you are.
  useEffect(() => {
    if (open) optionRefs.current[selectedIndex]?.focus();
  }, [open, selectedIndex]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function choose(option: FilterOption<T>) {
    onChange(option.value);
    close(true);
  }

  function onListKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close(false);
      return;
    }

    const move =
      event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : event.key === 'Home' ? -index : event.key === 'End' ? options.length - 1 - index : 0;

    if (move !== 0) {
      event.preventDefault();
      const next = (index + move + options.length) % options.length;
      optionRefs.current[next]?.focus();
    }
  }

  return (
    <div ref={wrapper} className={cn('relative', className)}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'inline-flex items-center gap-xs rounded-full px-md py-[0.5rem] text-body-sm transition-all duration-150',
          'shadow-floating hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-obsidian/25',
          active
            ? 'bg-lemon text-obsidian'
            : 'border border-white/90 bg-white/85 text-ink-body hover:bg-white',
        )}
      >
        <span className={active ? 'text-obsidian/70' : 'text-ink-subtle'}>{label}:</span>
        <span className="font-semibold">{selected?.label ?? value}</span>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className={cn('h-3 w-3 transition-transform duration-150', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={undefined}
          // DESIGN.md level 3: a dropdown surface is pure white, not frosted —
          // a translucent menu lets the table beneath it show through the
          // option labels. It scrolls once the list is long, because the
          // options are API-driven and can grow.
          className="absolute left-0 top-[calc(100%+0.5rem)] z-20 max-h-[18rem] min-w-[12rem]
            overflow-y-auto rounded-md border border-white bg-white p-2xs shadow-depth-obsidian"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => choose(option)}
                onKeyDown={(event) => onListKeyDown(event, index)}
                className={cn(
                  'flex w-full items-center justify-between gap-sm rounded-full px-md py-[0.4rem] text-left text-body-sm',
                  'transition-colors duration-150 focus-visible:outline-none',
                  isSelected
                    ? 'bg-lemon text-obsidian'
                    : 'text-ink-body hover:bg-ink/5 focus-visible:bg-ink/5',
                )}
              >
                <span className={isSelected ? 'font-semibold' : undefined}>{option.label}</span>
                {option.hint !== undefined && (
                  <span className={isSelected ? 'text-obsidian/70' : 'text-ink-subtle'}>
                    {option.hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
