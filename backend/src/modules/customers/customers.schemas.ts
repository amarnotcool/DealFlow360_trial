import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

export const listQuerySchema = z.object({
  /** Free text over name, code and email. */
  search: z.string().trim().min(1).optional(),
  customerTierId: z.string().uuid().optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const contactParamsSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
});

/**
 * A portal password is optional everywhere: a contact can exist as a name on
 * file long before anyone gives them portal access.
 */
const portalPassword = z.string().min(8).max(200);

const contactFields = {
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(1).max(50).nullish(),
  isPrimary: z.boolean().default(false),
  portalPassword: portalPassword.nullish(),
};

export const createCustomerSchema = z.object({
  // `code` is not accepted: the service derives it from the name, so a rep
  // adding a customer mid-quote never has to invent one.
  name: z.string().trim().min(1).max(200),
  customerTierId: z.string().uuid(),
  email: z.string().trim().email().max(200).nullish(),
  phone: z.string().trim().min(1).max(50).nullish(),
  billingAddress: z.string().trim().min(1).max(500).nullish(),
  shippingAddress: z.string().trim().min(1).max(500).nullish(),
  /** An optional first contact, created in the same transaction. */
  primaryContact: z.object(contactFields).optional(),
});
export type CreateCustomerBody = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    customerTierId: z.string().uuid().optional(),
    email: z.string().trim().email().max(200).nullish(),
    phone: z.string().trim().min(1).max(50).nullish(),
    billingAddress: z.string().trim().min(1).max(500).nullish(),
    shippingAddress: z.string().trim().min(1).max(500).nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'An update needs at least one field',
  });
export type UpdateCustomerBody = z.infer<typeof updateCustomerSchema>;

export const createContactSchema = z.object(contactFields);
export type CreateContactBody = z.infer<typeof createContactSchema>;

export const updateContactSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(200).optional(),
    phone: z.string().trim().min(1).max(50).nullish(),
    isPrimary: z.boolean().optional(),
    isActive: z.boolean().optional(),
    /** Sets or replaces the portal password; null revokes portal access. */
    portalPassword: portalPassword.nullish(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'An update needs at least one field',
  });
export type UpdateContactBody = z.infer<typeof updateContactSchema>;
