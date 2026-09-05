import { z } from 'zod';

/** See quotations.schemas.ts — replaced by auth middleware when that lands. */
const actorUserId = z.string().uuid();

export const listQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const decisionSchema = z.object({
  actorUserId,
  reason: z.string().max(2000).nullish(),
});
export type DecisionBody = z.infer<typeof decisionSchema>;
