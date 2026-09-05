import type {
  CategoryView,
  ProductDeleteResult,
  ProductDetailView,
  ProductListItem,
} from '@dealflow360/shared';

import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '../../lib/api-client';

export interface ProductQuery {
  search?: string;
  categoryId?: string;
  /** Deactivated products are hidden unless the catalogue asks for them. */
  includeInactive?: boolean;
}

function toQueryString(query: ProductQuery): string {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.includeInactive) params.set('includeInactive', 'true');

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export function fetchProducts(query: ProductQuery = {}) {
  return apiList<ProductListItem>(`/products${toQueryString(query)}`);
}

export function fetchProduct(id: string) {
  return apiGet<ProductDetailView>(`/products/${id}`);
}

export function fetchCategories() {
  return apiList<CategoryView>('/categories');
}

export interface ProductVariantInput {
  sku: string;
  name: string;
  extraPrice: number;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  categoryId: string;
  description?: string | null;
  listPrice: number;
  unitCost: number;
  isSubscription: boolean;
  recurringCycle?: string | null;
  variants?: ProductVariantInput[];
}

export function createProduct(body: CreateProductInput) {
  return apiPost<ProductDetailView>('/products', body);
}

/** Every field is optional — the API merges what is sent onto the stored row. */
export type UpdateProductInput = Partial<Omit<CreateProductInput, 'variants'>> & {
  isActive?: boolean;
};

export function updateProduct(id: string, body: UpdateProductInput) {
  return apiPatch<ProductDetailView>(`/products/${id}`, body);
}

/** Deletes a product nothing has used; deactivates one history depends on. */
export function deleteProduct(id: string) {
  return apiDelete<ProductDeleteResult>(`/products/${id}`, {});
}

export function addVariant(productId: string, body: ProductVariantInput) {
  return apiPost<ProductDetailView>(`/products/${productId}/variants`, body);
}

export function updateVariant(
  productId: string,
  variantId: string,
  body: Partial<ProductVariantInput> & { isActive?: boolean },
) {
  return apiPatch<ProductDetailView>(`/products/${productId}/variants/${variantId}`, body);
}

export function deleteVariant(productId: string, variantId: string) {
  return apiDelete<ProductDeleteResult>(`/products/${productId}/variants/${variantId}`, {});
}
