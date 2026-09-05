import { QuotationStatus, LineType } from '@prisma/client';
import { z } from 'zod';

// The acting user is read from the session by `auth`, never from the body, so
// no schema here carries an actor field.

export const listQuerySchema = z.object({
  status: z.nativeEnum(QuotationStatus).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });
export const lineParamsSchema = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });

const lineFields = {
  productId: z.string().uuid(),
  productVariantId: z.string().uuid().nullish(),
  subscriptionPlanId: z.string().uuid().nullish(),
  sourceRecommendationId: z.string().uuid().nullish(),
  lineType: z.nativeEnum(LineType).optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  description: z.string().nullish(),
};

export const createQuotationSchema = z.object({
  customerId: z.string().uuid(),
  customerContactId: z.string().uuid().nullish(),
  notes: z.string().nullish(),
  lines: z.array(z.object(lineFields)).default([]),
});
export type CreateQuotationBody = z.infer<typeof createQuotationSchema>;

export const lineSchema = z.object(lineFields);
export type LineBody = z.infer<typeof lineSchema>;

export const updateLineSchema = z.object({
  quantity: z.number().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  description: z.string().nullish(),
});
export type UpdateLineBody = z.infer<typeof updateLineSchema>;

