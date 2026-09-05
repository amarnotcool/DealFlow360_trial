import { z } from 'zod';

// The deciding user comes from the session, not the body.

export const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const decisionSchema = z.object({
  reason: z.string().max(2000).nullish(),
});
export type DecisionBody = z.infer<typeof decisionSchema>;
