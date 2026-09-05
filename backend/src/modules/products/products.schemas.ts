import { BillingCycle } from '@prisma/client';
import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

export const listQuerySchema = z.object({
  /** Free text over name and SKU. */
  search: z.string().trim().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  /** Deactivated products stay hidden unless the catalogue asks for them. */
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const variantIdParamSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
});

/** A variant supplied inline while creating its product. */
const nestedVariantSchema = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  extraPrice: z.number().min(0).default(0),
});

const subscriptionShape = {
  isSubscription: z.boolean().default(false),
  recurringCycle: z.nativeEnum(BillingCycle).nullish(),
};

/**
 * A subscription product needs a cycle and a one-time product must not carry
 * one — the billing engine reads `recurringCycle` to schedule periods, so a
 * mismatched pair would produce a subscription nobody can bill.
 */
function cyclesMatchKind(body: { isSubscription?: boolean; recurringCycle?: BillingCycle | null }) {
  if (body.isSubscription === true) return body.recurringCycle != null;
  if (body.isSubscription === false) return body.recurringCycle == null;
  // Not stated in this request: the service checks the merged row instead.
  return true;
}

const CYCLE_MESSAGE =
  'A subscription product needs a recurringCycle, and a one-time product must not have one';

export const createProductSchema = z
  .object({
    sku: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    categoryId: z.string().uuid(),
    description: z.string().trim().min(1).max(2000).nullish(),
    listPrice: z.number().min(0),
    unitCost: z.number().min(0).default(0),
    ...subscriptionShape,
    variants: z.array(nestedVariantSchema).max(20).default([]),
  })
  .refine(cyclesMatchKind, { message: CYCLE_MESSAGE, path: ['recurringCycle'] });
export type CreateProductBody = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    sku: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    categoryId: z.string().uuid().optional(),
    description: z.string().trim().min(1).max(2000).nullish(),
    listPrice: z.number().min(0).optional(),
    unitCost: z.number().min(0).optional(),
    isSubscription: z.boolean().optional(),
    recurringCycle: z.nativeEnum(BillingCycle).nullish(),
    /** Reactivates a product an admin deactivated earlier. */
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'An update needs at least one field',
  });
export type UpdateProductBody = z.infer<typeof updateProductSchema>;

export const createVariantSchema = nestedVariantSchema;
export type CreateVariantBody = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = z
  .object({
    sku: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    extraPrice: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'An update needs at least one field',
  });
export type UpdateVariantBody = z.infer<typeof updateVariantSchema>;

export const categoriesQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type CategoriesQuery = z.infer<typeof categoriesQuerySchema>;
