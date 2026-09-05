// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  RETURN = 'RETURN',
  DISCOUNT_EDIT = 'DISCOUNT_EDIT',
  MANUAL_OVERRIDE = 'MANUAL_OVERRIDE',
  CONFIRM = 'CONFIRM',
  CANCEL = 'CANCEL',
}

export enum ErpSyncStatus {
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
  DISABLED = 'DISABLED',
}

export enum GatewayTransactionStatus {
  INITIATED = 'INITIATED',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}
