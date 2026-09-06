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

// ---------------------------------------------------------------------------
// Internal wire shapes.
//
// What staff see is wider than the portal view: the same request, plus who the
// customer contact is and — once someone has answered — who answered and what
// they said. specs.md §2 gives the Sales Rep "respond to negotiation requests";
// this is the shape that desk reads and writes.
// ---------------------------------------------------------------------------

/** One negotiation request as the internal desk sees it. */
export interface NegotiationRequestView {
  id: string;
  quotationId: string;
  status: NegotiationStatus;
  comment: string | null;
  counterDiscountPct: string | null;
  requestedDeliveryDate: string | null;
  createdAt: string;
  /** Null for a request about the quotation as a whole, not one line. */
  line: {
    id: string;
    sequence: number;
    description: string | null;
    product: { id: string; sku: string; name: string };
    /** What the line is discounted at now, to compare against the counter. */
    discountPct: string;
  } | null;
  contact: { id: string; fullName: string; email: string };
  /** Set once a staff user has answered. */
  respondedBy: { id: string; fullName: string } | null;
  respondedAt: string | null;
  responseNote: string | null;
}

/** GET /quotations/:id/negotiations meta: the desk's queue at a glance. */
export interface NegotiationListMeta {
  total: number;
  byStatus: Record<NegotiationStatus, number>;
  /** Still waiting on someone — what the desk has to work through. */
  pending: number;
}

export type NegotiationDecision = 'ACCEPT' | 'REJECT';

export interface NegotiationRespondInput {
  decision: NegotiationDecision;
  /** What the customer will read back on their own screen. */
  responseNote?: string | null;
}

/**
 * What responding did. Accepting a counter prices it straight onto the line and
 * reruns the discount engine, so the answer carries the quotation's new state:
 * `RE_APPROVAL` means the agreed rate broke a ceiling and the quote went back
 * into the chain by itself, exactly as a portal confirm would have sent it.
 */
export type NegotiationRespondOutcome = 'ACCEPTED' | 'REJECTED' | 'RE_APPROVAL';

export interface NegotiationRespondResult {
  outcome: NegotiationRespondOutcome;
  request: NegotiationRequestView;
  /** The line the counter was priced onto, when one was. */
  appliedDiscountPct: string | null;
  quotation: {
    id: string;
    number: string;
    status: string;
    riskScore: string;
    riskLevel: string;
    requiresApproval: boolean;
  };
  /** The chain the quote re-entered, empty when it did not. */
  approvalChain: string[];
}
