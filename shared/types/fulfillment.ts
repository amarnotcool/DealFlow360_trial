// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

export enum SalesOrderStatus {
  CONFIRMED = 'CONFIRMED',
  PARTIALLY_FULFILLED = 'PARTIALLY_FULFILLED',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
}

export enum SplitSuggestionStatus {
  SUGGESTED = 'SUGGESTED',
  ACCEPTED = 'ACCEPTED',
  OVERRIDDEN = 'OVERRIDDEN',
  REJECTED = 'REJECTED',
}

export enum FulfillmentStatus {
  PENDING = 'PENDING',
  RESERVED = 'RESERVED',
  PICKED = 'PICKED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum BackorderStatus {
  OPEN = 'OPEN',
  PARTIALLY_RESOLVED = 'PARTIALLY_RESOLVED',
  CONSOLIDATED = 'CONSOLIDATED',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}
