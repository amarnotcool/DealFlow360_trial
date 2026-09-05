import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './reporting.controller';
import {
  reportExportQuerySchema,
  reportFiltersSchema,
  reportQuotationsQuerySchema,
} from './reporting.schemas';

export const reportingRoutes = Router();

// specs.md §2 puts analytics with the manager and admin desks; finance reads
// the same numbers for the money side. A rep sees their own quotations, not
// the whole book, so reporting is closed to them.
const readsReports = requireRole('SALES_MANAGER', 'FINANCE', 'ADMIN');

// Path-scoped so this guard never runs for another module's routes.
reportingRoutes.use('/reports', auth, readsReports);

reportingRoutes.get(
  '/reports/summary',
  validate('query', reportFiltersSchema),
  asyncHandler(controller.summary),
);

reportingRoutes.get(
  '/reports/quotations',
  validate('query', reportQuotationsQuerySchema),
  asyncHandler(controller.quotations),
);

reportingRoutes.get(
  '/reports/discounts',
  validate('query', reportFiltersSchema),
  asyncHandler(controller.discounts),
);

// The "Sales Team" filter's options, from the quotations themselves rather
// than the admin-only staff directory.
reportingRoutes.get('/reports/owners', asyncHandler(controller.owners));

// specs screen 15's "Export PDF": the same filtered report as a file.
reportingRoutes.get(
  '/reports/export',
  validate('query', reportExportQuerySchema),
  asyncHandler(controller.exportReport),
);
