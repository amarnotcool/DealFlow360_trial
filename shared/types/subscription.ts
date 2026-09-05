// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

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
