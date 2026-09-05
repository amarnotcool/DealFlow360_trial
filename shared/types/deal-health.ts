// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

export enum AlertType {
  STALLED_DEAL = 'STALLED_DEAL',
  DISCOUNT_ANOMALY = 'DISCOUNT_ANOMALY',
  DELIVERY_SLIPPAGE = 'DELIVERY_SLIPPAGE',
}

export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum AlertStatus {
  OPEN = 'OPEN',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
}

// ---------------------------------------------------------------------------
// Wire shapes (screen 14). Money and percentages cross as strings, the way
// Prisma serialises Decimal.
// ---------------------------------------------------------------------------

/** Why an alert fired, in the detector's own numbers. */
export interface AlertMetadata {
  /** STALLED_DEAL: whole days since the quotation last moved. */
  idleDays?: number;
  stalledAfterDays?: number;
  /** DISCOUNT_ANOMALY: this quote's weighted discount against the rep's own. */
  quoteDiscountPct?: number;
  repAverageDiscountPct?: number;
  repQuoteCount?: number;
  /** DELIVERY_SLIPPAGE: how late the promise is, and what is still unshipped. */
  daysLate?: number;
  promisedDate?: string;
  fulfillmentIds?: string[];
}

export interface AlertView {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  metadata: AlertMetadata;
  /** The quotation an alert opens. Every alert carries one (specs.md §4). */
  quotation: {
    id: string;
    number: string;
    status: string;
    totalAmount: string;
    customer: { id: string; code: string; name: string };
    ownerUser: { id: string; fullName: string };
  } | null;
  salesOrder: { id: string; number: string; status: string } | null;
  acknowledgedByUser: { id: string; fullName: string } | null;
}

/** GET /alerts meta: how many of each type and status are open right now. */
export interface AlertListMeta {
  total: number;
  byType: Record<AlertType, number>;
  byStatus: Record<AlertStatus, number>;
}

/** POST /alerts/scan — what the run found, per detector. */
export interface AlertScanResult {
  created: number;
  existing: number;
  byType: Record<AlertType, { created: number; existing: number }>;
  /** The alerts this run opened, ready to render without a second call. */
  alerts: AlertView[];
}
