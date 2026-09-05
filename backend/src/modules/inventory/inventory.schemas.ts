import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

export const listQuerySchema = z.object({
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  /** Only rows at or below their reorder point. */
  needsReorder: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

/** Quantities are Decimal(14,2), so two decimal places is the whole precision. */
const quantity = z.number().max(9_999_999_999);

const stockTarget = {
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  /** Null or absent addresses the product-level row, as the allocator does. */
  productVariantId: z.string().uuid().nullish(),
};

export const receiveSchema = z.object({
  ...stockTarget,
  quantity: quantity.positive(),
  /** A goods receipt note, purchase order number, or whatever ops writes down. */
  reference: z.string().trim().min(1).max(200).nullish(),
});
export type ReceiveBody = z.infer<typeof receiveSchema>;

/**
 * A correction is either an absolute count or a movement, never both: a stock
 * count sets `newOnHand`, shrinkage or damage sends a negative `delta`.
 */
export const adjustSchema = z
  .object({
    ...stockTarget,
    newOnHand: quantity.min(0).optional(),
    delta: quantity.optional(),
    // Mandatory: an adjustment with no explanation is indistinguishable from a
    // mistake when someone reads the audit log later.
    reason: z.string().trim().min(1).max(500),
  })
  .refine((body) => (body.newOnHand === undefined) !== (body.delta === undefined), {
    message: 'Send exactly one of newOnHand or delta',
  })
  .refine((body) => body.delta === undefined || body.delta !== 0, {
    message: 'A delta of zero changes nothing',
  });
export type AdjustBody = z.infer<typeof adjustSchema>;

export const reorderPointSchema = z.object({
  reorderPoint: quantity.min(0),
});
export type ReorderPointBody = z.infer<typeof reorderPointSchema>;
