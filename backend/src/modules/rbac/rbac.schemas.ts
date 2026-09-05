import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

const ROLE_CODES = ['SALES_REP', 'SALES_MANAGER', 'FINANCE', 'ADMIN'] as const;

/**
 * One role per user. The schema allows several and login picks the most
 * capable, but every account this API creates holds exactly one, so the role
 * a guard checks is the role an admin chose.
 */
const role = z.enum(ROLE_CODES);

const password = z.string().min(8).max(200);

export const listQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  role: role.optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const createUserSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  // An admin types the first password; there is no signup and no reset flow.
  password,
  role,
});
export type CreateUserBody = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(200).optional(),
    role: role.optional(),
    isActive: z.boolean().optional(),
    /** Optional: when present, the password is re-hashed and replaced. */
    password: password.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'An update needs at least one field',
  });
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
