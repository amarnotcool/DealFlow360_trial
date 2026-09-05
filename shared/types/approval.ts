// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

export enum ApprovalLevel {
  SALES_MANAGER = 'SALES_MANAGER',
  FINANCE = 'FINANCE',
}

export enum ApprovalStepStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
}
