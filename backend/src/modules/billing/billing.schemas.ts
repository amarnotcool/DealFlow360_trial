import { InvoiceStatus, InvoiceType, PaymentMethod } from '@prisma/client';
import { z } from 'zod';

// The acting user comes from the session, so no schema carries an actor field.

export const listQuerySchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  type: z.nativeEnum(InvoiceType).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.BANK_TRANSFER),
  reference: z.string().min(1).nullish(),
});
export type PaymentBody = z.infer<typeof paymentSchema>;
