// Shared field chrome for the catalogue's forms, so create and edit look alike.

import type { ReactNode } from 'react';

export const FIELD_CLASS =
  'frost-input w-full rounded-full px-md py-[0.5rem] text-body-sm text-ink-body ' +
  'placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60';

/** The billing cycles the API accepts, mirroring the Prisma enum. */
export const CYCLES = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUAL', label: 'Annual' },
] as const;

export function LabelledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2xs">
      <span className="text-label-md text-ink-subtle">{label}</span>
      {children}
    </label>
  );
}
