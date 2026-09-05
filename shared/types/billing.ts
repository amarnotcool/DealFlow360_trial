// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

export enum BillingScheduleStatus {
  SCHEDULED = 'SCHEDULED',
  INVOICED = 'INVOICED',
  SKIPPED = 'SKIPPED',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

export enum InvoiceType {
  ONE_TIME = 'ONE_TIME',
  RECURRING = 'RECURRING',
}

export enum PaymentMethod {
  CARD = 'CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
  CASH = 'CASH',
  GATEWAY = 'GATEWAY',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum CreditNoteStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  APPLIED = 'APPLIED',
  CANCELLED = 'CANCELLED',
}

export enum CreditNoteReason {
  CANCELLATION = 'CANCELLATION',
  RETURN = 'RETURN',
  PRORATION_ADJUSTMENT = 'PRORATION_ADJUSTMENT',
  GOODWILL = 'GOODWILL',
}

// ---------------------------------------------------------------------------
// Wire shapes (screens 12 and 13). Decimal columns arrive as strings and dates
// as ISO strings, exactly as the API serialises them.
// ---------------------------------------------------------------------------

/**
 * Wire form of PaymentMethod. A union rather than the enum, exactly as the
 * proration types are, so a form can hold a method without importing the enum
 * object at runtime.
 */
export type PaymentMethodValue = 'CARD' | 'BANK_TRANSFER' | 'CHECK' | 'CASH' | 'GATEWAY';

export interface InvoiceLineView {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  /** Set on a recurring line: the period the line bills. */
  periodStart: string | null;
  periodEnd: string | null;
  salesOrderLineId: string | null;
  /** Set on a one-time line: the shipment the quantity came from. */
  fulfillmentId: string | null;
}

export interface PaymentView {
  id: string;
  method: PaymentMethodValue;
  status: PaymentStatus;
  amount: string;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface CreditNoteView {
  id: string;
  number: string;
  status: CreditNoteStatus;
  reason: CreditNoteReason;
  amount: string;
  appliedAmount: string;
  issuedAt: string | null;
  notes: string | null;
  createdAt: string;
}

/** The money and dates every invoice surface shows. */
export interface InvoiceSummaryView {
  id: string;
  number: string;
  type: InvoiceType;
  status: InvoiceStatus;
  issueDate: string | null;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  notes: string | null;
  createdAt: string;
}

export interface InvoiceListItem extends InvoiceSummaryView {
  customer: { id: string; code: string; name: string };
  salesOrder: { id: string; number: string } | null;
  subscription: { id: string; subscriptionPlan: { code: string; name: string } } | null;
  _count: { lines: number; payments: number };
}

export interface InvoiceListMeta {
  total: number;
  counts: {
    unpaid: number;
    paid: number;
    totalAmount: string;
    paidAmount: string;
    balanceAmount: string;
  };
}

export interface InvoiceDetailView extends InvoiceSummaryView {
  customer: { id: string; code: string; name: string };
  salesOrder: { id: string; number: string; status: string } | null;
  subscription: {
    id: string;
    status: string;
    billingCycle: string;
    subscriptionPlan: { id: string; code: string; name: string };
  } | null;
  lines: InvoiceLineView[];
  payments: PaymentView[];
  creditNotes: CreditNoteView[];
}

export interface InvoiceWithLinesView extends InvoiceSummaryView {
  lines: InvoiceLineView[];
}

/**
 * GET /orders/:id/billing — specs.md screen 10: the one-time and the recurring
 * stream of a single order, kept apart.
 */
export interface OrderBillingView {
  salesOrder: { id: string; number: string; status: string; totalAmount: string };
  oneTimeInvoices: InvoiceWithLinesView[];
  recurringInvoices: InvoiceWithLinesView[];
  subscriptions: Array<{
    id: string;
    status: string;
    billingCycle: string;
    quantity: string;
    unitPrice: string;
    recurringAmount: string;
    nextBillingDate: string | null;
    subscriptionPlan: { code: string; name: string };
  }>;
}
