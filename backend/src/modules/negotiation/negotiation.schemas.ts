import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

export const quotationParamSchema = z.object({ id: z.string().uuid() });

export const requestParamSchema = z.object({ id: z.string().uuid() });

export const respondSchema = z.object({
  /** ACCEPT prices the counter onto the line; REJECT leaves the line alone. */
  decision: z.enum(['ACCEPT', 'REJECT']),
  /** What the customer reads back on their own screen. */
  responseNote: z.string().trim().min(1).max(500).nullish(),
});
export type RespondBody = z.infer<typeof respondSchema>;
