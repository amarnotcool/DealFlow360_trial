import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './deal-health.controller';
import { escalateSchema, idParamSchema, listQuerySchema } from './deal-health.schemas';

export const dealHealthRoutes = Router();

// specs.md §2 puts "monitor deal health" with the Sales Manager, and the same
// desk that works approvals reads this board — finance sees it, a rep does not.
const seesTheBoard = requireRole('SALES_MANAGER', 'FINANCE', 'ADMIN');

// Scanning, acknowledging and escalating are the manager's own actions.
const worksTheBoard = requireRole('SALES_MANAGER', 'ADMIN');

// Path-scoped so these never run for another module's routes.
dealHealthRoutes.use('/alerts', auth, seesTheBoard);

dealHealthRoutes.get('/alerts', validate('query', listQuerySchema), asyncHandler(controller.list));

// Explicit trigger, not a timer: REST-first (CLAUDE.md rule 6), and the run is
// idempotent, so pressing it twice opens nothing twice.
dealHealthRoutes.post('/alerts/scan', worksTheBoard, asyncHandler(controller.scan));

dealHealthRoutes.post(
  '/alerts/:id/acknowledge',
  worksTheBoard,
  validate('params', idParamSchema),
  asyncHandler(controller.acknowledge),
);

// Screen 14's Escalate / Nudge Rep: one act on the record, audited with a note.
dealHealthRoutes.post(
  '/alerts/:id/escalate',
  worksTheBoard,
  validate('params', idParamSchema),
  validate('body', escalateSchema),
  asyncHandler(controller.escalate),
);
