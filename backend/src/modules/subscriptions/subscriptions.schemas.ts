import { SubscriptionStatus } from '@prisma/client';
import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

export const listQuerySchema = z.object({
  status: z.nativeEnum(SubscriptionStatus).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const changeSchema = z
  .object({
    subscriptionPlanId: z.string().uuid().nullish(),
    quantity: z.number().positive().nullish(),
    effectiveDate: z.string().datetime().nullish(),
    notes: z.string().min(1).nullish(),
  })
  .refine((body) => body.subscriptionPlanId != null || body.quantity != null, {
    message: 'A change needs a new plan, a new quantity, or both',
  });
export type ChangeBody = z.infer<typeof changeSchema>;

export const cancelSchema = z.object({
  reason: z.string().min(1).nullish(),
  effectiveDate: z.string().datetime().nullish(),
});
export type CancelBody = z.infer<typeof cancelSchema>;

