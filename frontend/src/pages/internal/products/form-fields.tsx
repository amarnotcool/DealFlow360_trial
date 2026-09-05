// The catalogue's form chrome. Field styling is shared with every other form
// in the workspace; only the billing cycles are the catalogue's own.

export { FIELD_CLASS, LabelledField } from '../../../components/ui';

/** The billing cycles the API accepts, mirroring the Prisma enum. */
export const CYCLES = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUAL', label: 'Annual' },
] as const;
