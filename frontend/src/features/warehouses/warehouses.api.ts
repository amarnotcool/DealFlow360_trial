import type {
  WarehouseDeleteResult,
  WarehouseDetailView,
  WarehouseSummary,
} from '@dealflow360/shared';

import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '../../lib/api-client';

export function fetchWarehouses(includeInactive = false) {
  return apiList<WarehouseSummary>(`/warehouses${includeInactive ? '?includeInactive=true' : ''}`);
}

export function fetchWarehouse(id: string) {
  return apiGet<WarehouseDetailView>(`/warehouses/${id}`);
}

export interface CreateWarehouseInput {
  code: string;
  name: string;
  address?: string | null;
  /** Relative cost of shipping one shipment out of this warehouse. */
  shippingCostWeight?: number;
  /** Lower comes first when two warehouses are equally good. */
  priority?: number;
}

export function createWarehouse(body: CreateWarehouseInput) {
  return apiPost<WarehouseDetailView>('/warehouses', body);
}

export type UpdateWarehouseInput = Partial<CreateWarehouseInput> & { isActive?: boolean };

export function updateWarehouse(id: string, body: UpdateWarehouseInput) {
  return apiPatch<WarehouseDetailView>(`/warehouses/${id}`, body);
}

/** Deletes a warehouse nothing has used; deactivates one the record needs. */
export function deleteWarehouse(id: string) {
  return apiDelete<WarehouseDeleteResult>(`/warehouses/${id}`, {});
}
