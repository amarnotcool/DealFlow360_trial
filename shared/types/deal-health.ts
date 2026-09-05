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
