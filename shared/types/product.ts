// Wire shapes for the product catalog (specs.md screens 16 and 17).
//
// Money crosses the boundary as a string: Prisma serialises Decimal that way,
// and rounding it into a JS number here would lose the scale the catalogue is
// priced at. Format for display in the frontend's lib/format.ts.

import type { BillingCycle } from './subscription';

export interface CategoryView {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ProductVariantView {
  id: string;
  sku: string;
  name: string;
  /** Added to the parent product's list price, not a price of its own. */
  extraPrice: string;
  isActive: boolean;
}

/** One row of GET /products. */
export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  category: CategoryView;
  listPrice: string;
  unitCost: string;
  isSubscription: boolean;
  recurringCycle: BillingCycle | null;
  isActive: boolean;
  variants: ProductVariantView[];
}

/** One entry of a price list that names this product. */
export interface ProductPriceListEntryView {
  id: string;
  priceListId: string;
  priceListCode: string;
  priceListName: string;
  currency: string;
  /** Null when the entry prices the product itself rather than a variant. */
  variantId: string | null;
  variantName: string | null;
  unitPrice: string;
  minQuantity: string;
}

/** Where a product is stocked, so the catalogue can say if it ships at all. */
export interface ProductStockView {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: string;
  reserved: string;
  available: string;
}

/** GET /products/:id. */
export interface ProductDetailView extends ProductListItem {
  description: string | null;
  priceListEntries: ProductPriceListEntryView[];
  stock: ProductStockView[];
  /** Quotation lines referencing it — what blocks a hard delete. */
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** DELETE /products/:id answers with what actually happened. */
export interface ProductDeleteResult {
  id: string;
  /** DEACTIVATED when the product is referenced, DELETED when it was unused. */
  outcome: 'DEACTIVATED' | 'DELETED';
  usageCount: number;
  product: ProductDetailView | null;
}

export interface WarehouseListItem {
  id: string;
  code: string;
  name: string;
  address: string | null;
  shippingCostWeight: string;
  priority: number;
  isActive: boolean;
}
