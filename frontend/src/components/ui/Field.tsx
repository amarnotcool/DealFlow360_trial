// Shared field chrome, so every form in the workspace looks the same.
//
// A `<select>` nested in a `<label>` absorbs its option text into its
// accessible name, so every select here carries an explicit `aria-label`.

import type { ReactNode } from 'react';

export const FIELD_CLASS =
  'frost-input w-full rounded-full px-md py-[0.5rem] text-body-sm text-ink-body ' +
  'placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60';

export function LabelledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2xs">
      <span className="text-label-md text-ink-subtle">{label}</span>
      {children}
    </label>
  );
}
