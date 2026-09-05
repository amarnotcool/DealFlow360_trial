// One shape for an inventory_stock row, shared by the inventory endpoints and
// the warehouse detail screen so the two can never drift apart.

import { Prisma } from '@prisma/client';
import type { InventoryStockView } from '@dealflow360/shared';

export const stockInclude = {
  warehouse: { select: { id: true, code: true, name: true } },
  product: { select: { id: true, sku: true, name: true } },
  productVariant: { select: { id: true, sku: true, name: true } },
} satisfies Prisma.InventoryStockInclude;

export type StockRow = Prisma.InventoryStockGetPayload<{ include: typeof stockInclude }>;

export function toStockView(row: StockRow): InventoryStockView {
  return {
    id: row.id,
    warehouse: row.warehouse,
    product: row.product,
    productVariant: row.productVariant,
    onHand: row.onHand.toFixed(2),
    reserved: row.reserved.toFixed(2),
    available: row.available.toFixed(2),
    reorderPoint: row.reorderPoint.toFixed(2),
    // A reorder point of zero is "not tracked", not "always needs reordering".
    needsReorder: row.reorderPoint.greaterThan(0) && row.available.lessThanOrEqualTo(row.reorderPoint),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Totals for a set of stock rows, as the warehouse list and detail report them. */
export function summarise(rows: Array<Pick<StockRow, 'onHand' | 'reserved' | 'available' | 'reorderPoint'>>) {
  const zero = new Prisma.Decimal(0);

  return {
    stockLineCount: rows.length,
    totalOnHand: rows.reduce((sum, row) => sum.plus(row.onHand), zero).toFixed(2),
    totalReserved: rows.reduce((sum, row) => sum.plus(row.reserved), zero).toFixed(2),
    totalAvailable: rows.reduce((sum, row) => sum.plus(row.available), zero).toFixed(2),
    reorderLineCount: rows.filter(
      (row) => row.reorderPoint.greaterThan(0) && row.available.lessThanOrEqualTo(row.reorderPoint),
    ).length,
  };
}
