import { z } from 'zod';

export const listQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
