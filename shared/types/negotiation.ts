// Mirrors the Prisma enum of the same name in backend/prisma/schema.prisma.

export enum NegotiationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

// ---------------------------------------------------------------------------
// Customer portal wire shapes.
//
// What a customer sees is deliberately narrower than the internal view: line
// prices, their own discounts and their own negotiation history, but none of
// the internal risk machinery — no ceilings, no blended score, no approval
// chain. Decimal columns arrive as strings.
// ---------------------------------------------------------------------------

export interface PortalNegotiationView {
  id: string;
  quotationLineId: string | null;
  status: NegotiationStatus;
  comment: string | null;
  counterDiscountPct: string | null;
  requestedDeliveryDate: string | null;
  responseNote: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface PortalQuotationLineView {
  id: string;
  sequence: number;
  lineType: 'ONE_TIME' | 'RECURRING';
  description: string | null;
  product: { id: string; sku: string; name: string };
  quantity: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
}

export interface PortalQuotationListItem {
  id: string;
  number: string;
  /** Only the stages a customer is meant to see reach the portal. */
  status: 'APPROVED' | 'NEGOTIATION' | 'PENDING_APPROVAL' | 'CONFIRMED';
  totalAmount: string;
  oneTimeTotalAmount: string;
  recurringTotalAmount: string;
  validUntil: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  _count: { lines: number; negotiationRequests: number };
}

export interface PortalQuotationDetailView extends PortalQuotationListItem {
  customer: { id: string; name: string };
  subtotalAmount: string;
  discountAmount: string;
  notes: string | null;
  lines: PortalQuotationLineView[];
  negotiationRequests: PortalNegotiationView[];
}

/** One line of a counter-offer the customer sends. */
export interface PortalNegotiationInput {
  /** Null for a comment about the quotation as a whole. */
  quotationLineId?: string | null;
  comment?: string | null;
  counterDiscountPct?: number | null;
  /** ISO date the customer would like the order delivered by. */
  requestedDeliveryDate?: string | null;
}

/**
 * What confirming did. RE_APPROVAL means the agreed terms went back over a
 * ceiling and the quote re-entered the approval chain on its own; CONFIRMED
 * means the terms were within every ceiling and an order was created.
 */
export type PortalConfirmOutcome = 'RE_APPROVAL' | 'CONFIRMED';

export interface PortalConfirmResult {
  outcome: PortalConfirmOutcome;
  quotation: PortalQuotationDetailView;
  /** Set when the confirm produced an order. */
  salesOrder: { id: string; number: string } | null;
  /** Set when the confirm sent the quote back into approval. */
  approvalChain: string[];
  appliedCounters: Array<{ quotationLineId: string; discountPct: string }>;
}
