import type {
  FulfillmentDetailView,
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

export function suggestSplit(salesOrderId: string, actorUserId: string) {
  return apiPost<FulfillmentDetailView>(`/fulfillment/${salesOrderId}/suggest-split`, { actorUserId });
}

export function acceptSplit(salesOrderId: string, actorUserId: string, suggestionId?: string | null) {
  return apiPost<FulfillmentDetailView>(`/fulfillment/${salesOrderId}/accept-split`, {
    actorUserId,
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
  body: { actorUserId: string; reason?: string | null; allocations: OverrideAllocation[] },
) {
  return apiPost<FulfillmentDetailView>(`/fulfillment/${salesOrderId}/override-split`, body);
}

/**
 * Ships the reserved shipments. This is what makes billing legal: the one-time
 * invoice is raised for the quantities this shipment carried, nothing more.
 */
export function shipFulfillments(salesOrderId: string, actorUserId: string) {
  return apiPost<FulfillmentDetailView>(`/fulfillment/${salesOrderId}/ship`, { actorUserId });
}
