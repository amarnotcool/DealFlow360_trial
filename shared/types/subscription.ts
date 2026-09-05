// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

import type { BillingScheduleStatus, InvoiceSummaryView, InvoiceType } from './billing';

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
}

export enum BillingCycle {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUAL = 'ANNUAL',
}

export enum ProrationType {
  UPGRADE = 'UPGRADE',
  DOWNGRADE = 'DOWNGRADE',
  QUANTITY_CHANGE = 'QUANTITY_CHANGE',
  CANCELLATION = 'CANCELLATION',
}

// ---------------------------------------------------------------------------
// Proration engine I/O (backend/src/modules/subscriptions/proration.ts)
//
// The engine is pure: it never reads a subscription or a plan. The service
// resolves the current terms, the new terms and the cycle window, and passes
// them in. Money is decimal currency at Decimal(14,2) scale; the engine works
// in integer paise internally so a half-cycle upgrade lands on an exact amount.
// ---------------------------------------------------------------------------

/**
 * The change being priced. A union rather than the enum so the backend can pass
 * Prisma's enum straight through, exactly as the discount engine does with
 * approval levels.
 */
export type ProrationChangeType = 'UPGRADE' | 'DOWNGRADE' | 'QUANTITY_CHANGE' | 'CANCELLATION';

export interface ProrationInput {
  type: ProrationChangeType;
  /** Unit price and quantity in force before the change. */
  oldPlanPrice: number;
  oldQuantity: number;
  /** Unit price and quantity taking effect. Ignored for CANCELLATION. */
  newPlanPrice: number;
  newQuantity: number;
  daysInCycle: number;
  /** Days left in the cycle at the change date, cycle end exclusive. */
  remainingDays: number;
}

export type ProrationDirection = 'CHARGE' | 'CREDIT' | 'NONE';

export interface ProrationResult {
  /** Signed: positive is owed by the customer, negative is owed to them. */
  prorationAmount: number;
  direction: ProrationDirection;
  /** The positive amount to charge, 0 when the change is a credit. */
  chargeAmount: number;
  /** The positive amount to credit, 0 when the change is a charge. */
  creditAmount: number;
  oldEffectivePrice: number;
  newEffectivePrice: number;
  remainingDays: number;
  daysInCycle: number;
}

// ---------------------------------------------------------------------------
// Wire shapes (screens 9 and 10). Decimal columns arrive as strings and dates
// as ISO strings, exactly as the API serialises them.
// ---------------------------------------------------------------------------

export interface SubscriptionPlanView {
  id: string;
  code: string;
  name: string;
  billingCycle: BillingCycle;
  recurringPrice: string;
  setupFee: string;
  termMonths: number | null;
  isActive: boolean;
}

export interface SubscriptionListItem {
  id: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  quantity: string;
  unitPrice: string;
  recurringAmount: string;
  startDate: string;
  nextBillingDate: string | null;
  cancelledAt: string | null;
  customer: { id: string; code: string; name: string };
  subscriptionPlan: { id: string; code: string; name: string; billingCycle: BillingCycle };
  salesOrder: { id: string; number: string } | null;
  _count: { invoices: number; prorationEvents: number };
}

export interface SubscriptionListMeta {
  total: number;
  counts: { active: number; paused: number; cancelled: number };
}

/** One priced change, as the proration engine produced it. */
export interface ProrationEventView {
  id: string;
  type: ProrationType;
  effectiveDate: string;
  previousQuantity: string;
  newQuantity: string;
  previousUnitPrice: string;
  newUnitPrice: string;
  proratedAmount: string;
  creditAmount: string;
  notes: string | null;
  createdAt: string;
}

export interface BillingScheduleView {
  id: string;
  invoiceType: InvoiceType;
  status: BillingScheduleStatus;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: string;
  invoiceId: string | null;
}

export interface SubscriptionDetailView extends Omit<SubscriptionListItem, 'subscriptionPlan' | '_count'> {
  cancellationReason: string | null;
  endDate: string | null;
  subscriptionPlan: SubscriptionPlanView;
  prorationEvents: ProrationEventView[];
  billingSchedules: BillingScheduleView[];
  invoices: InvoiceSummaryView[];
  creditNotes: Array<{
    id: string;
    number: string;
    prorationEventId: string | null;
    status: string;
    reason: string;
    amount: string;
    issuedAt: string | null;
    notes: string | null;
  }>;
}
