import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

export const listQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const createWarehouseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    // The allocator and every report key off this code, so keep it terse.
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'Use upper-case letters, digits, - or _'),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500).nullish(),
  /** Relative cost of shipping one shipment out of this warehouse. */
  shippingCostWeight: z.number().positive().max(9_999_999).default(1),
  /** Lower comes first when two warehouses are equally good. */
  priority: z.number().int().min(0).max(9999).default(0),
});
export type CreateWarehouseBody = z.infer<typeof createWarehouseSchema>;

export const updateWarehouseSchema = z
  .object({
    code: createWarehouseSchema.shape.code.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    address: z.string().trim().min(1).max(500).nullish(),
    shippingCostWeight: z.number().positive().max(9_999_999).optional(),
    priority: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'An update needs at least one field',
  });
export type UpdateWarehouseBody = z.infer<typeof updateWarehouseSchema>;
