import type {
  BackorderConsolidationResult,
  FulfillmentDetailView,
  OpenBackorderView,
  SalesOrderListItem,
  WarehouseStockView,
} from '@dealflow360/shared';

import { apiGet, apiList, apiPost } from '../../lib/api-client';

export interface FulfillmentListMeta {
  total: number;
  warehouses: WarehouseStockView[];
}

export function fetchFulfillmentOrders() {
  return apiList<SalesOrderListItem, FulfillmentListMeta>('/fulfillment');
}

export function fetchFulfillmentOrder(salesOrderId: string) {
  return apiGet<FulfillmentDetailView>(`/fulfillment/${salesOrderId}`);
}

export function suggestSplit(salesOrderId: string) {
  return apiPost<FulfillmentDetailView>(`/fulfillment/${salesOrderId}/suggest-split`, {});
}

export function acceptSplit(salesOrderId: string, suggestionId?: string | null) {
  return apiPost<FulfillmentDetailView>(`/fulfillment/${salesOrderId}/accept-split`, {
    suggestionId: suggestionId ?? null,
  });
}

export interface OverrideAllocation {
  salesOrderLineId: string;
  warehouseId: string;
  quantity: number;
}

export function overrideSplit(
  salesOrderId: string,
  body: { reason?: string | null; allocations: OverrideAllocation[] },
) {
  return apiPost<FulfillmentDetailView>(`/fulfillment/${salesOrderId}/override-split`, body);
}

/**
 * Ships the reserved shipments. This is what makes billing legal: the one-time
 * invoice is raised for the quantities this shipment carried, nothing more.
 */
export function shipFulfillments(salesOrderId: string) {
  return apiPost<FulfillmentDetailView>(`/fulfillment/${salesOrderId}/ship`, {});
}

export interface BackorderQuery {
  salesOrderId?: string;
  /** Resolved and cancelled backorders are hidden unless asked for. */
  includeResolved?: boolean;
}

export function fetchBackorders(query: BackorderQuery = {}) {
  const params = new URLSearchParams();
  if (query.salesOrderId) params.set('salesOrderId', query.salesOrderId);
  if (query.includeResolved) params.set('includeResolved', 'true');

  const encoded = params.toString();
  return apiList<OpenBackorderView>(`/backorders${encoded ? `?${encoded}` : ''}`);
}

/**
 * Runs the allocator again over what the order still has on backorder. It
 * reserves whatever stock has arrived since; shipping stays a separate step.
 */
export function consolidateBackorders(salesOrderId: string, reason?: string | null) {
  return apiPost<BackorderConsolidationResult>(
    `/fulfillment/${salesOrderId}/consolidate-backorders`,
    { reason: reason ?? null },
  );
}
