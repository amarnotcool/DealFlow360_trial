// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

export enum QuotationStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  NEGOTIATION = 'NEGOTIATION',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum LineType {
  ONE_TIME = 'ONE_TIME',
  RECURRING = 'RECURRING',
}
