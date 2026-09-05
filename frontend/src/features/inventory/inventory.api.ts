import type { InventoryStockView, StockMovementResult } from '@dealflow360/shared';

import { apiList, apiPatch, apiPost } from '../../lib/api-client';

export interface InventoryQuery {
  warehouseId?: string;
  productId?: string;
  /** Only rows at or below their reorder point. */
  needsReorder?: boolean;
}

function toQueryString(query: InventoryQuery): string {
  const params = new URLSearchParams();
  if (query.warehouseId) params.set('warehouseId', query.warehouseId);
  if (query.productId) params.set('productId', query.productId);
  if (query.needsReorder) params.set('needsReorder', 'true');

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export function fetchInventory(query: InventoryQuery = {}) {
  return apiList<InventoryStockView>(`/inventory${toQueryString(query)}`);
}

export interface ReceiveStockInput {
  warehouseId: string;
  productId: string;
  productVariantId?: string | null;
  quantity: number;
  /** A goods receipt note or purchase order number. */
  reference?: string | null;
}

/** Stock arriving. Opens the row when the warehouse never held the product. */
export function receiveStock(body: ReceiveStockInput) {
  return apiPost<StockMovementResult>('/inventory/receive', body);
}

export interface AdjustStockInput {
  warehouseId: string;
  productId: string;
  productVariantId?: string | null;
  /** Exactly one of these: a counted level, or a signed movement. */
  newOnHand?: number;
  delta?: number;
  reason: string;
}

export function adjustStock(body: AdjustStockInput) {
  return apiPost<StockMovementResult>('/inventory/adjust', body);
}

export function setReorderPoint(stockId: string, reorderPoint: number) {
  return apiPatch<StockMovementResult>(`/inventory/${stockId}`, { reorderPoint });
}
