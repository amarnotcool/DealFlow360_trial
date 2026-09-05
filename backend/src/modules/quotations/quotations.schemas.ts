import { QuotationStatus, LineType } from '@prisma/client';
import { z } from 'zod';

/**
 * Until the auth module lands there is no session to read the acting user from,
 * so writes carry `actorUserId` explicitly. It is a real user id — the audit log
 * is never written with a fabricated or anonymous actor. `auth` middleware will
 * supply it instead, and this field goes away.
 */
const actorUserId = z.string().uuid();

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
  ownerUserId: z.string().uuid(),
  notes: z.string().nullish(),
  lines: z.array(z.object(lineFields)).default([]),
  actorUserId,
});
export type CreateQuotationBody = z.infer<typeof createQuotationSchema>;

export const lineSchema = z.object({ ...lineFields, actorUserId });
export type LineBody = z.infer<typeof lineSchema>;

export const updateLineSchema = z.object({
  quantity: z.number().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  description: z.string().nullish(),
  actorUserId,
});
export type UpdateLineBody = z.infer<typeof updateLineSchema>;

export const actorSchema = z.object({ actorUserId });
export type ActorBody = z.infer<typeof actorSchema>;
