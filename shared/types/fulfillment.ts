// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

import type { LineType } from './quotation';

export enum SalesOrderStatus {
  CONFIRMED = 'CONFIRMED',
  PARTIALLY_FULFILLED = 'PARTIALLY_FULFILLED',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
}

export enum SplitSuggestionStatus {
  SUGGESTED = 'SUGGESTED',
  ACCEPTED = 'ACCEPTED',
  OVERRIDDEN = 'OVERRIDDEN',
  REJECTED = 'REJECTED',
}

export enum FulfillmentStatus {
  PENDING = 'PENDING',
  RESERVED = 'RESERVED',
  PICKED = 'PICKED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum BackorderStatus {
  OPEN = 'OPEN',
  PARTIALLY_RESOLVED = 'PARTIALLY_RESOLVED',
  CONSOLIDATED = 'CONSOLIDATED',
  RESOLVED = 'RESOLVED',
  CANCELLED = 'CANCELLED',
}

// ---------------------------------------------------------------------------
// Split allocator I/O (backend/src/modules/fulfillment/split-allocator.ts)
//
// The allocator is pure: it never reads stock itself. The service resolves
// warehouses and inventory_stock rows and hands them in as plain objects.
// Quantities are decimal quantities at Decimal(14,2) scale; the allocator works
// in integer hundredths internally so 6 + 4 is exactly 10.
// ---------------------------------------------------------------------------

export interface SplitAllocatorWarehouse {
  warehouseId: string;
  warehouseCode: string;
  /** Relative cost of shipping one shipment out of this warehouse. */
  shippingCostWeight: number;
}

/** One inventory_stock row as the allocator sees it. */
export interface SplitAllocatorStock {
  warehouseId: string;
  productId: string;
  productVariantId: string | null;
  availableQty: number;
}

export interface SplitAllocatorLineInput {
  lineId: string;
  productId: string;
  productVariantId: string | null;
  requiredQty: number;
}

export interface SplitAllocatorInput {
  warehouses: SplitAllocatorWarehouse[];
  stock: SplitAllocatorStock[];
  lines: SplitAllocatorLineInput[];
}

export interface SplitAllocation {
  warehouseId: string;
  warehouseCode: string;
  quantity: number;
}

export interface SplitAllocatorLineResult {
  lineId: string;
  requiredQty: number;
  allocatedQty: number;
  /** Whatever stock could not cover. 0 when the line is fully allocated. */
  backorderQty: number;
  allocations: SplitAllocation[];
}

/** One shipment: everything allocated out of a single warehouse. */
export interface SplitAllocatorShipment {
  warehouseId: string;
  warehouseCode: string;
  shippingCostWeight: number;
  totalQty: number;
  lines: Array<{ lineId: string; quantity: number }>;
}

export interface SplitAllocatorResult {
  lines: SplitAllocatorLineResult[];
  shipments: SplitAllocatorShipment[];
  estimatedShipmentCount: number;
  /** Sum of the shipping cost weight of every warehouse that ships. */
  estimatedCost: number;
  totalBackorderQty: number;
}

// ---------------------------------------------------------------------------
// Wire shapes (screens 7 and 8). Decimal columns arrive as strings; the numbers
// the allocator produced arrive as numbers, exactly as it returned them.
// ---------------------------------------------------------------------------

export interface WarehouseStockRow {
  productId: string;
  sku: string;
  name: string;
  onHand: string;
  reserved: string;
  available: string;
}

export interface WarehouseStockView {
  id: string;
  code: string;
  name: string;
  shippingCostWeight: string;
  lines: WarehouseStockRow[];
}

export interface SplitSuggestionSummary {
  id: string;
  status: SplitSuggestionStatus;
  isManualOverride: boolean;
  estimatedShipmentCount: number;
  estimatedCost: string;
  generatedAt: string;
  acceptedAt: string | null;
}

export interface SalesOrderListItem {
  id: string;
  number: string;
  status: SalesOrderStatus;
  orderDate: string;
  totalAmount: string;
  customer: { id: string; code: string; name: string };
  quotation: { id: string; number: string };
  latestSuggestion: SplitSuggestionSummary | null;
  _count: { lines: number; fulfillments: number; backorders: number };
}

export interface SalesOrderLineView {
  id: string;
  sequence: number;
  lineType: LineType;
  quantity: string;
  quantityFulfilled: string;
  unitPrice: string;
  discountPct: string;
  lineTotal: string;
  product: { id: string; sku: string; name: string };
  productVariant: { id: string; sku: string; name: string } | null;
}

export interface FulfillmentView {
  id: string;
  status: FulfillmentStatus;
  isManualOverride: boolean;
  shippingCost: string;
  lines: Array<{ salesOrderLineId: string; productId: string; quantity: string }>;
  warehouse: { id: string; code: string; name: string };
  createdAt: string;
}

export interface BackorderView {
  id: string;
  status: BackorderStatus;
  quantity: string;
  salesOrderLine: { id: string; productId: string; sequence: number };
}

/** One line of the split the allocator suggests, with its per-warehouse draw. */
export interface SuggestedSplitLine extends SplitAllocatorLineResult {
  salesOrderLineId: string;
  productId: string | null;
  description: string | null;
}

export interface SuggestedSplitSkippedLine {
  salesOrderLineId: string;
  productId: string;
  reason: 'RECURRING' | 'NOT_STOCK_TRACKED' | 'ALREADY_FULFILLED';
  description: string | null;
}

export interface SuggestedSplitView extends Omit<SplitAllocatorResult, 'lines'> {
  lines: SuggestedSplitLine[];
  skipped: SuggestedSplitSkippedLine[];
}

export interface FulfillmentDetailView {
  id: string;
  number: string;
  status: SalesOrderStatus;
  orderDate: string;
  totalAmount: string;
  customer: { id: string; code: string; name: string };
  quotation: { id: string; number: string; status: string };
  lines: SalesOrderLineView[];
  fulfillments: FulfillmentView[];
  backorders: BackorderView[];
  suggestions: SplitSuggestionSummary[];
  latestSuggestion: SplitSuggestionSummary | null;
  /** Status of the stored split, or null while none has been stored yet. */
  splitStatus: SplitSuggestionStatus | null;
  suggestedSplit: SuggestedSplitView;
}

/** POST /quotations/:id/confirm returns the order it created. */
export interface SalesOrderConfirmationView {
  id: string;
  number: string;
  status: SalesOrderStatus;
  totalAmount: string;
  customer: { id: string; name: string };
  quotation: { id: string; number: string; status: string };
  lines: Array<{ id: string; sequence: number; quantity: string; lineTotal: string }>;
}
