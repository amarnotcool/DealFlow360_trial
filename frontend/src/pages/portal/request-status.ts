// Customer-facing wording for a negotiation request's state.

import type { BadgeVariant } from '../../components/ui/Badge';

interface RequestState {
  label: string;
  variant: BadgeVariant;
}

const STATES: Record<string, RequestState> = {
  PENDING: { label: 'Sent', variant: 'neutral' },
  ACCEPTED: { label: 'Applied', variant: 'primary' },
  REJECTED: { label: 'Not possible', variant: 'critical' },
  WITHDRAWN: { label: 'Withdrawn', variant: 'neutral' },
};

/** Falls back to a neutral pill rather than rendering an empty badge. */
export function requestState(status: string): RequestState {
  return STATES[status] ?? { label: 'Sent', variant: 'neutral' };
}
