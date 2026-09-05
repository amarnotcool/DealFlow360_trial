// Warehouse reads. Stock levels and allocation stay in the fulfillment module —
// this only answers "which warehouses exist", which the catalogue and any
// warehouse picker need without pulling in a fulfillment view.

import type { WarehouseListItem } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';

export async function listWarehouses(includeInactive: boolean): Promise<WarehouseListItem[]> {
  const rows = await prisma.warehouse.findMany({
    where: includeInactive ? {} : { isActive: true },
    // The allocator's own preference order, so a picker lists them the same way.
    orderBy: [{ priority: 'asc' }, { code: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    shippingCostWeight: row.shippingCostWeight.toFixed(2),
    priority: row.priority,
    isActive: row.isActive,
  }));
}
