// Mirrors the Prisma enums of the same name in backend/prisma/schema.prisma.

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
