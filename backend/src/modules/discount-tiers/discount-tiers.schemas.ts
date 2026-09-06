import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

export const idParamSchema = z.object({ id: z.string().uuid() });

export const updateCeilingSchema = z.object({
  /**
   * Decimal percent at Decimal(6,2) scale — 12.5 means 12.5%. A ceiling of 0
   * is legitimate (no discount allowed at all); 100 is the ceiling's own limit.
   */
  ceilingPct: z.number().min(0).max(100),
  reason: z.string().trim().max(2000).nullish(),
});
export type UpdateCeilingBody = z.infer<typeof updateCeilingSchema>;
