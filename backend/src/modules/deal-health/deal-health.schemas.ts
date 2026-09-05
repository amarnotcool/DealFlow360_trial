import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

const ALERT_TYPES = ['STALLED_DEAL', 'DISCOUNT_ANOMALY', 'DELIVERY_SLIPPAGE'] as const;
const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'ESCALATED', 'RESOLVED'] as const;

export const listQuerySchema = z.object({
  /** Omitted, the list answers with everything still live. */
  status: z.enum(ALERT_STATUSES).optional(),
  type: z.enum(ALERT_TYPES).optional(),
  assignedUserId: z.string().uuid().optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const escalateSchema = z.object({
  /** Optional note; the audit entry falls back to naming the alert. */
  note: z.string().trim().min(1).max(500).nullish(),
});
export type EscalateBody = z.infer<typeof escalateSchema>;
