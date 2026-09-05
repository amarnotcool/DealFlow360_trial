// Every auditable action goes through here (CLAUDE.md rule 5).
// Takes a transaction client so the log lands in the same commit as the change.

import type { AuditAction, Prisma } from '@prisma/client';

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: AuditAction;
  userId?: string | null;
  reason?: string | null;
  changes?: Prisma.InputJsonValue;
}

export async function recordAudit(
  tx: Prisma.TransactionClient,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      userId: entry.userId ?? null,
      reason: entry.reason ?? null,
      changes: entry.changes ?? {},
    },
  });
}
