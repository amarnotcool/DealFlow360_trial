import { z } from 'zod';

// The acting contact comes from the portal session, never from the body.

export const idParamSchema = z.object({ id: z.string().uuid() });

const negotiationItemSchema = z
  .object({
    /** Null for a comment about the quotation as a whole. */
    quotationLineId: z.string().uuid().nullish(),
    comment: z.string().min(1).max(2000).nullish(),
    counterDiscountPct: z.number().min(0).max(100).nullish(),
  })
  .refine((item) => item.comment != null || item.counterDiscountPct != null, {
    message: 'A negotiation request needs a comment, a counter discount, or both',
  })
  .refine((item) => item.counterDiscountPct == null || item.quotationLineId != null, {
    message: 'A counter discount has to name the line it applies to',
  });

export const negotiateSchema = z.object({
  requests: z.array(negotiationItemSchema).min(1).max(50),
});
export type NegotiateBody = z.infer<typeof negotiateSchema>;
