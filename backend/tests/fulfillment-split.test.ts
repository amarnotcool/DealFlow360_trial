// Split allocator tests (CLAUDE.md "Testing").
//
// Inputs are built here, not read from the seed: the allocator is pure, so a
// test needs no database and no warehouse fixture.

import { describe, expect, it } from 'vitest';
import type { SplitAllocatorInput } from '@dealflow360/shared';

import { allocateSplit } from '../src/modules/fulfillment/split-allocator';

const MUMBAI = { warehouseId: 'wh-mumbai', warehouseCode: 'WH-MUMBAI', shippingCostWeight: 1 };
const DELHI = { warehouseId: 'wh-delhi', warehouseCode: 'WH-DELHI', shippingCostWeight: 1.5 };

describe('allocateSplit', () => {
  it('splits one line across two warehouses when neither can cover it alone', () => {
    const input: SplitAllocatorInput = {
      warehouses: [MUMBAI, DELHI],
      stock: [
        { warehouseId: MUMBAI.warehouseId, productId: 'laptop', productVariantId: 'laptop-16-512', availableQty: 6 },
        { warehouseId: DELHI.warehouseId, productId: 'laptop', productVariantId: 'laptop-16-512', availableQty: 5 },
      ],
      lines: [
        { lineId: 'line-laptop', productId: 'laptop', productVariantId: 'laptop-16-512', requiredQty: 10 },
      ],
    };

    const result = allocateSplit(input);
    const line = result.lines[0];

    // Deepest stock first, so the order needs as few warehouses as possible.
    expect(line.allocations).toEqual([
      { warehouseId: MUMBAI.warehouseId, warehouseCode: 'WH-MUMBAI', quantity: 6 },
      { warehouseId: DELHI.warehouseId, warehouseCode: 'WH-DELHI', quantity: 4 },
    ]);

    expect(line.allocatedQty).toBe(10);
    expect(line.allocatedQty).toBe(line.requiredQty);
    expect(line.backorderQty).toBe(0);

    expect(result.estimatedShipmentCount).toBe(2);
    expect(result.estimatedCost).toBe(2.5);
    expect(result.totalBackorderQty).toBe(0);
  });

  it('backorders whatever the available stock cannot cover', () => {
    const input: SplitAllocatorInput = {
      warehouses: [MUMBAI, DELHI],
      stock: [
        { warehouseId: MUMBAI.warehouseId, productId: 'warranty', productVariantId: null, availableQty: 3 },
        { warehouseId: DELHI.warehouseId, productId: 'warranty', productVariantId: null, availableQty: 0 },
      ],
      lines: [{ lineId: 'line-warranty', productId: 'warranty', productVariantId: null, requiredQty: 5 }],
    };

    const result = allocateSplit(input);
    const line = result.lines[0];

    expect(line.allocations).toEqual([
      { warehouseId: MUMBAI.warehouseId, warehouseCode: 'WH-MUMBAI', quantity: 3 },
    ]);
    expect(line.allocatedQty).toBe(3);
    expect(line.backorderQty).toBe(2);

    // The empty warehouse never becomes a shipment.
    expect(result.estimatedShipmentCount).toBe(1);
    expect(result.totalBackorderQty).toBe(2);
  });

  it('prefers a single cheaper warehouse over a split when one can cover the line', () => {
    const input: SplitAllocatorInput = {
      warehouses: [MUMBAI, DELHI],
      stock: [
        { warehouseId: MUMBAI.warehouseId, productId: 'laptop', productVariantId: null, availableQty: 4 },
        { warehouseId: DELHI.warehouseId, productId: 'laptop', productVariantId: null, availableQty: 9 },
      ],
      lines: [{ lineId: 'line-laptop', productId: 'laptop', productVariantId: null, requiredQty: 4 }],
    };

    const result = allocateSplit(input);

    expect(result.lines[0].allocations).toEqual([
      { warehouseId: MUMBAI.warehouseId, warehouseCode: 'WH-MUMBAI', quantity: 4 },
    ]);
    expect(result.estimatedShipmentCount).toBe(1);
  });

  it('reuses a warehouse across lines instead of opening another shipment', () => {
    const input: SplitAllocatorInput = {
      warehouses: [MUMBAI, DELHI],
      stock: [
        { warehouseId: MUMBAI.warehouseId, productId: 'laptop', productVariantId: null, availableQty: 10 },
        { warehouseId: MUMBAI.warehouseId, productId: 'warranty', productVariantId: null, availableQty: 2 },
        { warehouseId: DELHI.warehouseId, productId: 'warranty', productVariantId: null, availableQty: 8 },
      ],
      lines: [
        { lineId: 'line-laptop', productId: 'laptop', productVariantId: null, requiredQty: 10 },
        { lineId: 'line-warranty', productId: 'warranty', productVariantId: null, requiredQty: 2 },
      ],
    };

    const result = allocateSplit(input);

    expect(result.estimatedShipmentCount).toBe(1);
    expect(result.lines[1].allocations).toEqual([
      { warehouseId: MUMBAI.warehouseId, warehouseCode: 'WH-MUMBAI', quantity: 2 },
    ]);
  });

  it('does not promise the same stock to two lines of the same product', () => {
    const input: SplitAllocatorInput = {
      warehouses: [MUMBAI],
      stock: [
        { warehouseId: MUMBAI.warehouseId, productId: 'laptop', productVariantId: null, availableQty: 5 },
      ],
      lines: [
        { lineId: 'line-a', productId: 'laptop', productVariantId: null, requiredQty: 3 },
        { lineId: 'line-b', productId: 'laptop', productVariantId: null, requiredQty: 4 },
      ],
    };

    const result = allocateSplit(input);

    expect(result.lines[0].allocatedQty).toBe(3);
    expect(result.lines[1].allocatedQty).toBe(2);
    expect(result.lines[1].backorderQty).toBe(2);
  });

  it('keeps fractional quantities exact', () => {
    const input: SplitAllocatorInput = {
      warehouses: [MUMBAI, DELHI],
      stock: [
        { warehouseId: MUMBAI.warehouseId, productId: 'cable', productVariantId: null, availableQty: 0.6 },
        { warehouseId: DELHI.warehouseId, productId: 'cable', productVariantId: null, availableQty: 0.4 },
      ],
      lines: [{ lineId: 'line-cable', productId: 'cable', productVariantId: null, requiredQty: 1 }],
    };

    const result = allocateSplit(input);

    expect(result.lines[0].allocations.map((allocation) => allocation.quantity)).toEqual([0.6, 0.4]);
    expect(result.lines[0].backorderQty).toBe(0);
  });
});
