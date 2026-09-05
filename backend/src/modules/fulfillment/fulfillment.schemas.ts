import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

export const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const acceptSchema = z.object({
  suggestionId: z.string().uuid().nullish(),
});
export type AcceptBody = z.infer<typeof acceptSchema>;

export const overrideSchema = z.object({
  reason: z.string().min(1).nullish(),
  allocations: z
    .array(
      z.object({
        salesOrderLineId: z.string().uuid(),
        warehouseId: z.string().uuid(),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
});
export type OverrideBody = z.infer<typeof overrideSchema>;

export const backorderListQuerySchema = z.object({
  salesOrderId: z.string().uuid().optional(),
  includeResolved: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type BackorderListQuery = z.infer<typeof backorderListQuerySchema>;

export const consolidateSchema = z.object({
  /** Optional note; the audit entry falls back to describing what it did. */
  reason: z.string().trim().min(1).max(500).nullish(),
});
export type ConsolidateBody = z.infer<typeof consolidateSchema>;
