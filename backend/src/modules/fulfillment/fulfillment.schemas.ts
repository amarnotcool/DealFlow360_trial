import { z } from 'zod';

/**
 * Until the auth module lands there is no session to read the acting user from,
 * so writes carry `actorUserId` explicitly, exactly as the quotations module
 * does. `auth` middleware will supply it instead, and this field goes away.
 */
const actorUserId = z.string().uuid();

export const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const suggestSchema = z.object({ actorUserId });
export type SuggestBody = z.infer<typeof suggestSchema>;

export const acceptSchema = z.object({
  actorUserId,
  suggestionId: z.string().uuid().nullish(),
});
export type AcceptBody = z.infer<typeof acceptSchema>;

export const overrideSchema = z.object({
  actorUserId,
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
