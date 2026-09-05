import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { validate } from '../../middleware/validate';
import * as controller from './quotations.controller';
import {
  actorSchema,
  createQuotationSchema,
  idParamSchema,
  lineParamsSchema,
  lineSchema,
  listQuerySchema,
  updateLineSchema,
} from './quotations.schemas';

export const quotationsRoutes = Router();

quotationsRoutes.get('/quotations', validate('query', listQuerySchema), asyncHandler(controller.list));

quotationsRoutes.get(
  '/quotations/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

quotationsRoutes.post(
  '/quotations',
  validate('body', createQuotationSchema),
  asyncHandler(controller.create),
);

quotationsRoutes.post(
  '/quotations/:id/lines',
  validate('params', idParamSchema),
  validate('body', lineSchema),
  asyncHandler(controller.addLine),
);

quotationsRoutes.patch(
  '/quotations/:id/lines/:lineId',
  validate('params', lineParamsSchema),
  validate('body', updateLineSchema),
  asyncHandler(controller.updateLine),
);

quotationsRoutes.delete(
  '/quotations/:id/lines/:lineId',
  validate('params', lineParamsSchema),
  validate('body', actorSchema),
  asyncHandler(controller.removeLine),
);

quotationsRoutes.post(
  '/quotations/:id/submit',
  validate('params', idParamSchema),
  validate('body', actorSchema),
  asyncHandler(controller.submit),
);

quotationsRoutes.post(
  '/quotations/:id/confirm',
  validate('params', idParamSchema),
  validate('body', actorSchema),
  asyncHandler(controller.confirm),
);
