import { z } from 'zod';

export const recommendationParamsSchema = z.object({ id: z.string().uuid() });
export type RecommendationParams = z.infer<typeof recommendationParamsSchema>;
