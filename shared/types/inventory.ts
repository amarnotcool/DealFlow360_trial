// Wire shapes for warehouse administration and stock movement.
//
// Quantities are Decimal(14,2) columns, so they cross the boundary as strings
// exactly as Prisma serialises them; formatting belongs in lib/format.ts.

import type { WarehouseListItem } from './product';
import type { BackorderStatus } from './fulfillment';

/** One inventory_stock row, with the product and warehouse it belongs to. */
export interface InventoryStockView {
  id: string;
  warehouse: { id: string; code: string; name: string };
  product: { id: string; sku: string; name: string };
  productVariant: { id: string; sku: string; name: string } | null;
  onHand: string;
  reserved: string;
  available: string;
  reorderPoint: string;
  /** True when available has fallen to or below the reorder point. */
  needsReorder: boolean;
  updatedAt: string;
}

/** GET /warehouses rows carry a stock summary so the list is worth reading. */
export interface WarehouseSummary extends WarehouseListItem {
  stockLineCount: number;
  totalOnHand: string;
  totalReserved: string;
  totalAvailable: string;
  /** Lines at or below their reorder point — what an ops screen flags. */
  reorderLineCount: number;
}

/** GET /warehouses/:id — the warehouse and everything it holds. */
export interface WarehouseDetailView extends WarehouseSummary {
  stock: InventoryStockView[];
  openFulfillmentCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Deactivating a warehouse answers with what actually happened. */
export interface WarehouseDeleteResult {
  id: string;
  outcome: 'DEACTIVATED' | 'DELETED';
  /** Fulfillments, backorders and stock rows that kept it from being deleted. */
  referenceCount: number;
  warehouse: WarehouseDetailView;
}

/** A receipt, an adjustment or a reorder-point change answers the same way. */
export interface StockMovementResult {
  /** CREATED when the receipt opened the first stock row for this product. */
  outcome: 'CREATED' | 'UPDATED';
  onHandBefore: string;
  onHandAfter: string;
  stock: InventoryStockView;
}

// ---------------------------------------------------------------------------
// Backorders
// ---------------------------------------------------------------------------

/** GET /backorders — what is still short, and for whom. */
export interface OpenBackorderView {
  id: string;
  status: BackorderStatus;
  quantity: string;
  quantityResolved: string;
  /** quantity - quantityResolved: what consolidation would still have to find. */
  outstanding: string;
  expectedDate: string | null;
  createdAt: string;
  salesOrder: { id: string; number: string; status: string };
  customer: { id: string; code: string; name: string };
  salesOrderLine: {
    id: string;
    sequence: number;
    product: { id: string; sku: string; name: string };
    productVariant: { id: string; sku: string; name: string } | null;
  };
  warehouse: { id: string; code: string; name: string } | null;
}

/** One backorder's outcome after a consolidation run. */
export interface BackorderConsolidationLine {
  backorderId: string;
  status: BackorderStatus;
  outstandingBefore: string;
  allocated: string;
  outstandingAfter: string;
}

/** POST /fulfillment/:id/consolidate-backorders. */
export interface BackorderConsolidationResult {
  salesOrderId: string;
  /** Null when stock had arrived for nothing and no shipment was raised. */
  suggestionId: string | null;
  fulfillmentIds: string[];
  totalAllocated: string;
  totalStillShort: string;
  backorders: BackorderConsolidationLine[];
}
