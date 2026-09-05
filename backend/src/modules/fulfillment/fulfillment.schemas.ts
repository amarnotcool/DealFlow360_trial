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
