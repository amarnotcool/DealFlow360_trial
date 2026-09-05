// Warehouse administration.
//
// The split maths stays in the fulfillment module; this file only answers which
// warehouses exist, what each one holds, and lets an admin add or edit one.
// Stock is never moved here — that is the inventory module's job.

import { AuditAction, Prisma } from '@prisma/client';
import type {
  WarehouseDeleteResult,
  WarehouseDetailView,
  WarehouseSummary,
} from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import { stockInclude, summarise, toStockView } from '../inventory/inventory.mappers';
import type { CreateWarehouseBody, UpdateWarehouseBody } from './warehouses.schemas';

/** The allocator's own preference order, so every picker lists them the same. */
const WAREHOUSE_ORDER: Prisma.WarehouseOrderByWithRelationInput[] = [
  { priority: 'asc' },
  { code: 'asc' },
];

export async function listWarehouses(includeInactive: boolean): Promise<WarehouseSummary[]> {
  const rows = await prisma.warehouse.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: WAREHOUSE_ORDER,
    include: {
      inventoryStock: {
        select: { onHand: true, reserved: true, available: true, reorderPoint: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    shippingCostWeight: row.shippingCostWeight.toFixed(2),
    priority: row.priority,
    isActive: row.isActive,
    ...summarise(row.inventoryStock),
  }));
}

export async function getWarehouse(id: string): Promise<WarehouseDetailView> {
  const row = await prisma.warehouse.findUnique({
    where: { id },
    include: {
      inventoryStock: {
        include: stockInclude,
        orderBy: [{ product: { name: 'asc' } }, { productVariantId: 'asc' }],
      },
    },
  });
  if (!row) throw new NotFoundError('Warehouse', id);

  // Shipments this warehouse still owes: what a deactivation would strand.
  const openFulfillmentCount = await prisma.fulfillment.count({
    where: { warehouseId: id, status: { in: ['PENDING', 'RESERVED', 'PICKED'] } },
  });

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    shippingCostWeight: row.shippingCostWeight.toFixed(2),
    priority: row.priority,
    isActive: row.isActive,
    ...summarise(row.inventoryStock),
    stock: row.inventoryStock.map(toStockView),
    openFulfillmentCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function asCodeConflict(cause: unknown, code: string): never {
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
    throw new ConflictError(`Warehouse code ${code} is already in use`);
  }
  throw cause;
}

/** A before/after map, narrowed to the JSON the audit column stores. */
function asJson(changes: Record<string, { from: unknown; to: unknown }>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonValue;
}

export async function createWarehouse(
  body: CreateWarehouseBody,
  actorUserId: string,
): Promise<WarehouseDetailView> {
  const created = await prisma
    .$transaction(async (tx) => {
      const warehouse = await tx.warehouse.create({
        data: {
          code: body.code,
          name: body.name,
          address: body.address ?? null,
          shippingCostWeight: new Prisma.Decimal(body.shippingCostWeight),
          priority: body.priority,
        },
      });

      await recordAudit(tx, {
        entityType: 'warehouse',
        entityId: warehouse.id,
        action: AuditAction.CREATE,
        userId: actorUserId,
        reason: `Warehouse ${warehouse.code} created`,
        changes: {
          code: warehouse.code,
          name: warehouse.name,
          shippingCostWeight: warehouse.shippingCostWeight.toFixed(2),
          priority: warehouse.priority,
        },
      });

      return warehouse;
    })
    .catch((cause: unknown) => asCodeConflict(cause, body.code));

  return getWarehouse(created.id);
}

export async function updateWarehouse(
  id: string,
  body: UpdateWarehouseBody,
  actorUserId: string,
): Promise<WarehouseDetailView> {
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Warehouse', id);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const record = (field: string, from: unknown, to: unknown) => {
    if (from !== to) changes[field] = { from, to };
  };

  record('code', existing.code, body.code ?? existing.code);
  record('name', existing.name, body.name ?? existing.name);
  record('address', existing.address, body.address === undefined ? existing.address : body.address);
  record(
    'shippingCostWeight',
    existing.shippingCostWeight.toFixed(2),
    (body.shippingCostWeight === undefined
      ? existing.shippingCostWeight
      : new Prisma.Decimal(body.shippingCostWeight)
    ).toFixed(2),
  );
  record('priority', existing.priority, body.priority ?? existing.priority);
  record('isActive', existing.isActive, body.isActive ?? existing.isActive);

  await prisma
    .$transaction(async (tx) => {
      await tx.warehouse.update({
        where: { id },
        data: {
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.shippingCostWeight !== undefined
            ? { shippingCostWeight: new Prisma.Decimal(body.shippingCostWeight) }
            : {}),
          ...(body.priority !== undefined ? { priority: body.priority } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });

      await recordAudit(tx, {
        entityType: 'warehouse',
        entityId: id,
        action: AuditAction.UPDATE,
        userId: actorUserId,
        reason: `Warehouse ${existing.code} edited`,
        changes: asJson(changes),
      });
    })
    .catch((cause: unknown) => asCodeConflict(cause, body.code ?? existing.code));

  return getWarehouse(id);
}

/**
 * Deletes a warehouse nothing has used and deactivates one the record depends
 * on. A deactivated warehouse keeps its shipments and its stock rows; it simply
 * stops being offered to the allocator, which only reads active warehouses.
 */
export async function deactivateWarehouse(
  id: string,
  actorUserId: string,
): Promise<WarehouseDeleteResult> {
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Warehouse', id);

  const [fulfillments, backorders, stockRows] = await Promise.all([
    prisma.fulfillment.count({ where: { warehouseId: id } }),
    prisma.backorder.count({ where: { warehouseId: id } }),
    prisma.inventoryStock.count({ where: { warehouseId: id } }),
  ]);
  const referenceCount = fulfillments + backorders + stockRows;

  if (referenceCount === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.warehouse.delete({ where: { id } });
      await recordAudit(tx, {
        entityType: 'warehouse',
        entityId: id,
        action: AuditAction.DELETE,
        userId: actorUserId,
        reason: `Warehouse ${existing.code} deleted — nothing referenced it`,
        changes: { code: existing.code, name: existing.name },
      });
    });

    return {
      id,
      outcome: 'DELETED',
      referenceCount,
      // The row is gone, so the caller gets the shape it had on the way out.
      warehouse: {
        id,
        code: existing.code,
        name: existing.name,
        address: existing.address,
        shippingCostWeight: existing.shippingCostWeight.toFixed(2),
        priority: existing.priority,
        isActive: false,
        stockLineCount: 0,
        totalOnHand: '0.00',
        totalReserved: '0.00',
        totalAvailable: '0.00',
        reorderLineCount: 0,
        stock: [],
        openFulfillmentCount: 0,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
      },
    };
  }

  if (!existing.isActive) {
    throw new ConflictError(`Warehouse ${existing.code} is already deactivated`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.warehouse.update({ where: { id }, data: { isActive: false } });
    await recordAudit(tx, {
      entityType: 'warehouse',
      entityId: id,
      action: AuditAction.DELETE,
      userId: actorUserId,
      reason: `Warehouse ${existing.code} deactivated — ${referenceCount} record(s) still reference it`,
      changes: { isActive: { from: true, to: false }, referenceCount },
    });
  });

  return { id, outcome: 'DEACTIVATED', referenceCount, warehouse: await getWarehouse(id) };
}
