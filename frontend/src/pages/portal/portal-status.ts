// Customer-facing wording for the quotation stages.
//
// The portal never shows the internal vocabulary — no risk score, no approval
// chain, no "PENDING_APPROVAL". A customer is told what is happening to their
// quote, not how the workspace models it.

import type { BadgeVariant } from '../../components/ui/Badge';

export interface PortalStatusLabel {
  label: string;
  detail: string;
  variant: BadgeVariant;
}

export const PORTAL_STATUS: Record<string, PortalStatusLabel> = {
  APPROVED: {
    label: 'Ready for your review',
    detail: 'Review the lines below, ask for a change, or confirm to place the order.',
    variant: 'primary',
  },
  NEGOTIATION: {
    label: 'Your request is with us',
    detail: 'We have your requested changes. Confirm when you are happy with the terms.',
    variant: 'info',
  },
  PENDING_APPROVAL: {
    label: 'Being reviewed by our team',
    detail: 'Your updated terms are with our team for review. We will come back to you shortly.',
    variant: 'critical',
  },
  CONFIRMED: {
    label: 'Confirmed',
    detail: 'This quotation is confirmed and your order is being processed.',
    variant: 'dark',
  },
};

export function portalStatus(status: string): PortalStatusLabel {
  return (
    PORTAL_STATUS[status] ?? { label: 'In progress', detail: 'We are working on this quotation.', variant: 'neutral' }
  );
}
