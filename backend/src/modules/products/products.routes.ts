import { Router } from 'express';

import { asyncHandler } from '../../lib/async-handler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './products.controller';
import {
  categoriesQuerySchema,
  createProductSchema,
  createVariantSchema,
  idParamSchema,
  listQuerySchema,
  updateProductSchema,
  updateVariantSchema,
  variantIdParamSchema,
} from './products.schemas';

export const productsRoutes = Router();

// Maintaining the catalogue is admin work (specs.md §2); reading it is not —
// a rep picking a product for a quotation line needs the same list.
const maintainsCatalogue = requireRole('ADMIN');

// Path-scoped so these never run for another module's routes.
productsRoutes.use('/products', auth);
productsRoutes.use('/categories', auth);

productsRoutes.get('/products', validate('query', listQuerySchema), asyncHandler(controller.list));

productsRoutes.get(
  '/products/:id',
  validate('params', idParamSchema),
  asyncHandler(controller.detail),
);

productsRoutes.post(
  '/products',
  maintainsCatalogue,
  validate('body', createProductSchema),
  asyncHandler(controller.create),
);

productsRoutes.patch(
  '/products/:id',
  maintainsCatalogue,
  validate('params', idParamSchema),
  validate('body', updateProductSchema),
  asyncHandler(controller.update),
);

// Deletes a product nothing has used, deactivates one history depends on.
productsRoutes.delete(
  '/products/:id',
  maintainsCatalogue,
  validate('params', idParamSchema),
  asyncHandler(controller.remove),
);

productsRoutes.post(
  '/products/:id/variants',
  maintainsCatalogue,
  validate('params', idParamSchema),
  validate('body', createVariantSchema),
  asyncHandler(controller.createVariant),
);

productsRoutes.patch(
  '/products/:id/variants/:variantId',
  maintainsCatalogue,
  validate('params', variantIdParamSchema),
  validate('body', updateVariantSchema),
  asyncHandler(controller.updateVariant),
);

productsRoutes.delete(
  '/products/:id/variants/:variantId',
  maintainsCatalogue,
  validate('params', variantIdParamSchema),
  asyncHandler(controller.removeVariant),
);

// The category picker behind product create and edit — read only.
productsRoutes.get(
  '/categories',
  validate('query', categoriesQuerySchema),
  asyncHandler(controller.categories),
);
