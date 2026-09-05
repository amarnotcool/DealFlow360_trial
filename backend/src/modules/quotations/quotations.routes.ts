import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './quotations.controller';
import {
  createQuotationSchema,
  idParamSchema,
  lineParamsSchema,
  lineSchema,
  listQuerySchema,
  updateLineSchema,
} from './quotations.schemas';

export const quotationsRoutes = Router();

// specs.md §2: building a quote is the rep's job; everyone signed in can read
// one, because approvals, fulfillment and billing all start from a quote.
const buildsQuotes = requireRole('SALES_REP', 'ADMIN');
// A confirmed quote becomes an order — the rep who owns it or their manager.
const confirmsOrders = requireRole('SALES_REP', 'SALES_MANAGER', 'ADMIN');
// The approval desk reads the quote's story (screen 6); a rep never sees it.
const readsAuditTrail = requireRole('SALES_MANAGER', 'FINANCE', 'ADMIN');

// Path-scoped so this router never touches a request meant for another module:
// a bare `use(auth)` would answer for every path in the app.
quotationsRoutes.use('/quotations', auth);

quotationsRoutes.get(
  '/quotations/:id/audit',
  readsAuditTrail,
  validate('params', idParamSchema),
  asyncHandler(controller.auditTrail),
);

quotationsRoutes.get('/quotations', validate('query', listQuerySchema), asyncHandler(controller.list));

quotationsRoutes.get(
  '/quotations/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

quotationsRoutes.post(
  '/quotations',
  buildsQuotes,
  validate('body', createQuotationSchema),
  asyncHandler(controller.create),
);

quotationsRoutes.post(
  '/quotations/:id/lines',
  buildsQuotes,
  validate('params', idParamSchema),
  validate('body', lineSchema),
  asyncHandler(controller.addLine),
);

quotationsRoutes.patch(
  '/quotations/:id/lines/:lineId',
  buildsQuotes,
  validate('params', lineParamsSchema),
  validate('body', updateLineSchema),
  asyncHandler(controller.updateLine),
);

quotationsRoutes.delete(
  '/quotations/:id/lines/:lineId',
  buildsQuotes,
  validate('params', lineParamsSchema),
  asyncHandler(controller.removeLine),
);

quotationsRoutes.post(
  '/quotations/:id/submit',
  buildsQuotes,
  validate('params', idParamSchema),
  asyncHandler(controller.submit),
);

quotationsRoutes.post(
  '/quotations/:id/confirm',
  confirmsOrders,
  validate('params', idParamSchema),
  asyncHandler(controller.confirm),
);
