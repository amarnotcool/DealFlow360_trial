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
