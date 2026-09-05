import { z } from 'zod';

// Reporting is read-only, so every schema here is a query schema.

const QUOTATION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'NEGOTIATION',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
] as const;

/**
 * specs screen 15: "Filters: Period, Sales Team, Approval Status, Product."
 *
 * Period is from/to. There is no team table in the schema, so a team is read
 * as the owning rep — asking for one would mean a schema change, and the rep
 * is the grain every quotation already carries.
 */
export const reportFiltersSchema = z.object({
  /** Inclusive start of the period. A bare date is read as that day at 00:00. */
  from: z.coerce.date().optional(),
  /** Inclusive end: a bare date is widened to the end of that day below. */
  to: z.coerce.date().optional(),
  approvalStatus: z.enum(QUOTATION_STATUSES).optional(),
  productId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
});
export type ReportFiltersQuery = z.infer<typeof reportFiltersSchema>;

export const reportQuotationsQuerySchema = reportFiltersSchema.extend({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(500).default(100),
});
export type ReportQuotationsQuery = z.infer<typeof reportQuotationsQuerySchema>;

/**
 * Export takes the same filters plus the format. Only PDF is implemented —
 * specs also names XLS, and an unimplemented value must fail the schema rather
 * than silently hand back a PDF under an XLS name.
 */
export const reportExportQuerySchema = reportFiltersSchema.extend({
  format: z.literal('pdf').default('pdf'),
});
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
