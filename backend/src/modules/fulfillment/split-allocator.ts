// Warehouse split allocator (specs.md §4 "Warehouse splitting").
//
// Pure logic (CLAUDE.md rule 1): no Prisma, no Express, no I/O. Plain objects
// in, plain objects out. The service resolves warehouses and inventory_stock
// and hands them in; this file calls nothing.
//
// Goal, in order of precedence:
//   1. minimise the number of shipments (a shipment is one warehouse shipping,
//      so a warehouse already shipping for an earlier line is free to reuse);
//   2. among equally good options, prefer the lower shipping_cost_weight;
//   3. break every remaining tie on warehouse code, then id, so the same input
//      always produces the same output.
//
// Quantities are decimal quantities at Decimal(14,2) scale. They are converted
// to integer hundredths for the arithmetic, so 6 + 4 is exactly 10 and no float
// drift can reach the allocation numbers.

import type {
  SplitAllocation,
  SplitAllocatorInput,
  SplitAllocatorLineResult,
  SplitAllocatorResult,
  SplitAllocatorShipment,
  SplitAllocatorWarehouse,
} from '@dealflow360/shared';

const SCALE = 100;

const toHundredths = (value: number): number => Math.round(value * SCALE);
const fromHundredths = (hundredths: number): number => Number((hundredths / SCALE).toFixed(2));

/** A stock row the allocator can still draw from, with its warehouse resolved. */
interface Candidate {
  warehouse: SplitAllocatorWarehouse;
  ledgerKey: string;
  availableHundredths: number;
}

const stockKey = (warehouseId: string, productId: string, variantId: string | null): string =>
  `${warehouseId}|${productId}|${variantId ?? '*'}`;

/**
 * Orders candidates for a line. `used` holds the warehouses that are already
 * shipping something on this order — drawing from them adds no shipment.
 */
function byPreference(used: Set<string>, biggestFirst: boolean) {
  return (a: Candidate, b: Candidate): number => {
    const aUsed = used.has(a.warehouse.warehouseId) ? 0 : 1;
    const bUsed = used.has(b.warehouse.warehouseId) ? 0 : 1;
    if (aUsed !== bUsed) return aUsed - bUsed;

    if (biggestFirst && a.availableHundredths !== b.availableHundredths) {
      return b.availableHundredths - a.availableHundredths;
    }

    if (a.warehouse.shippingCostWeight !== b.warehouse.shippingCostWeight) {
      return a.warehouse.shippingCostWeight - b.warehouse.shippingCostWeight;
    }

    if (a.warehouse.warehouseCode !== b.warehouse.warehouseCode) {
      return a.warehouse.warehouseCode < b.warehouse.warehouseCode ? -1 : 1;
    }

    return a.warehouse.warehouseId < b.warehouse.warehouseId ? -1 : 1;
  };
}

export function allocateSplit(input: SplitAllocatorInput): SplitAllocatorResult {
  const warehouseById = new Map(input.warehouses.map((warehouse) => [warehouse.warehouseId, warehouse]));

  // A running ledger, so two lines of the same product cannot both be promised
  // the same unit of stock.
  const ledger = new Map<string, number>();
  for (const row of input.stock) {
    if (row.availableQty < 0) {
      throw new Error(`Negative available stock for product ${row.productId} in warehouse ${row.warehouseId}`);
    }
    const key = stockKey(row.warehouseId, row.productId, row.productVariantId);
    ledger.set(key, (ledger.get(key) ?? 0) + toHundredths(row.availableQty));
  }

  const used = new Set<string>();
  const shipmentLines = new Map<string, Array<{ lineId: string; quantity: number }>>();
  const lines: SplitAllocatorLineResult[] = [];

  for (const line of input.lines) {
    if (line.requiredQty < 0) {
      throw new Error(`Line ${line.lineId} has a negative required quantity`);
    }

    const requiredHundredths = toHundredths(line.requiredQty);
    const allocations: SplitAllocation[] = [];

    // Variant-level stock is the match; a line for a variant with no
    // variant-level rows anywhere falls back to the product-level rows.
    let candidates = collectCandidates(input, warehouseById, ledger, line.productId, line.productVariantId);
    if (candidates.length === 0 && line.productVariantId !== null) {
      candidates = collectCandidates(input, warehouseById, ledger, line.productId, null);
    }

    let remaining = requiredHundredths;

    if (remaining > 0) {
      // One warehouse covering the whole line is always the best outcome: one
      // shipment. Among those that can, the cheapest wins.
      const soleSource = candidates
        .filter((candidate) => candidate.availableHundredths >= remaining)
        .sort(byPreference(used, false))[0];

      const draw = soleSource ? [soleSource] : [...candidates].sort(byPreference(used, true));

      for (const candidate of draw) {
        if (remaining === 0) break;
        const take = Math.min(remaining, candidate.availableHundredths);
        if (take <= 0) continue;

        ledger.set(candidate.ledgerKey, candidate.availableHundredths - take);
        remaining -= take;
        used.add(candidate.warehouse.warehouseId);

        allocations.push({
          warehouseId: candidate.warehouse.warehouseId,
          warehouseCode: candidate.warehouse.warehouseCode,
          quantity: fromHundredths(take),
        });

        const existing = shipmentLines.get(candidate.warehouse.warehouseId) ?? [];
        existing.push({ lineId: line.lineId, quantity: fromHundredths(take) });
        shipmentLines.set(candidate.warehouse.warehouseId, existing);
      }
    }

    lines.push({
      lineId: line.lineId,
      requiredQty: fromHundredths(requiredHundredths),
      allocatedQty: fromHundredths(requiredHundredths - remaining),
      backorderQty: fromHundredths(remaining),
      allocations,
    });
  }

  const shipments: SplitAllocatorShipment[] = [...shipmentLines.entries()]
    .map(([warehouseId, entries]) => {
      const warehouse = warehouseById.get(warehouseId) as SplitAllocatorWarehouse;
      return {
        warehouseId,
        warehouseCode: warehouse.warehouseCode,
        shippingCostWeight: warehouse.shippingCostWeight,
        totalQty: fromHundredths(entries.reduce((sum, entry) => sum + toHundredths(entry.quantity), 0)),
        lines: entries,
      };
    })
    .sort((a, b) => (a.warehouseCode < b.warehouseCode ? -1 : a.warehouseCode > b.warehouseCode ? 1 : 0));

  return {
    lines,
    shipments,
    estimatedShipmentCount: shipments.length,
    estimatedCost: Number(
      shipments.reduce((sum, shipment) => sum + shipment.shippingCostWeight, 0).toFixed(2),
    ),
    totalBackorderQty: fromHundredths(
      lines.reduce((sum, line) => sum + toHundredths(line.backorderQty), 0),
    ),
  };
}

function collectCandidates(
  input: SplitAllocatorInput,
  warehouseById: Map<string, SplitAllocatorWarehouse>,
  ledger: Map<string, number>,
  productId: string,
  productVariantId: string | null,
): Candidate[] {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const row of input.stock) {
    if (row.productId !== productId || row.productVariantId !== productVariantId) continue;

    const warehouse = warehouseById.get(row.warehouseId);
    if (!warehouse) continue;

    const key = stockKey(row.warehouseId, productId, productVariantId);
    if (seen.has(key)) continue;
    seen.add(key);

    const availableHundredths = ledger.get(key) ?? 0;
    if (availableHundredths <= 0) continue;

    candidates.push({ warehouse, ledgerKey: key, availableHundredths });
  }

  return candidates;
}
