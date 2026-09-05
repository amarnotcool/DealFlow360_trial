// HTTP layer only: read the parsed request, call the service, shape the response.

import type { Request, Response } from 'express';

import { currentUser } from '../../middleware/auth';
import * as productsService from './products.service';
import type {
  CategoriesQuery,
  CreateProductBody,
  CreateVariantBody,
  ListQuery,
  UpdateProductBody,
  UpdateVariantBody,
} from './products.schemas';

export async function list(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const { rows, total } = await productsService.listProducts(query);

  res.json({ data: rows, error: null, meta: { total } });
}

export async function detail(req: Request, res: Response): Promise<void> {
  const product = await productsService.getProduct(req.params.id as string);
  res.json({ data: product, error: null });
}

export async function create(req: Request, res: Response): Promise<void> {
  const product = await productsService.createProduct(
    req.body as CreateProductBody,
    currentUser(req).id,
  );

  res.status(201).json({ data: product, error: null });
}

export async function update(req: Request, res: Response): Promise<void> {
  const product = await productsService.updateProduct(
    req.params.id as string,
    req.body as UpdateProductBody,
    currentUser(req).id,
  );

  res.json({ data: product, error: null });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const result = await productsService.deleteProduct(req.params.id as string, currentUser(req).id);
  res.json({ data: result, error: null });
}

export async function createVariant(req: Request, res: Response): Promise<void> {
  const product = await productsService.addVariant(
    req.params.id as string,
    req.body as CreateVariantBody,
    currentUser(req).id,
  );

  res.status(201).json({ data: product, error: null });
}

export async function updateVariant(req: Request, res: Response): Promise<void> {
  const product = await productsService.updateVariant(
    req.params.id as string,
    req.params.variantId as string,
    req.body as UpdateVariantBody,
    currentUser(req).id,
  );

  res.json({ data: product, error: null });
}

export async function removeVariant(req: Request, res: Response): Promise<void> {
  const result = await productsService.deleteVariant(
    req.params.id as string,
    req.params.variantId as string,
    currentUser(req).id,
  );

  res.json({ data: result, error: null });
}

export async function categories(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as CategoriesQuery;
  const rows = await productsService.listCategories(query.includeInactive);

  res.json({ data: rows, error: null, meta: { total: rows.length } });
}
