// Stock movement.
//
// Until now stock could only fall: the fulfillment module reserves it when a
// split is accepted and takes it out of the warehouse when a shipment leaves.
// Nothing put stock back. These are the two ways it goes up — a goods receipt
// and a counted correction — plus the reorder point that says when to reorder.
//
// The invariant every write here keeps is the same one fulfillment relies on:
//
//     available = onHand - reserved
//
// so a correction can never take onHand below what is already promised to a
// shipment. Each write runs in a transaction and re-reads the row inside it,
// so two receipts landing at once cannot lose one another's quantity.

import { AuditAction, Prisma } from '@prisma/client';
import type { InventoryStockView, StockMovementResult } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import { stockInclude, toStockView } from './inventory.mappers';
import type { AdjustBody, ListQuery, ReceiveBody, ReorderPointBody } from './inventory.schemas';

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listStock(
  query: ListQuery,
): Promise<{ rows: InventoryStockView[]; total: number }> {
  const where: Prisma.InventoryStockWhereInput = {
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.inventoryStock.findMany({
      where,
      include: stockInclude,
      orderBy: [{ warehouse: { code: 'asc' } }, { product: { name: 'asc' } }],
      skip: query.skip,
      take: query.take,
    }),
    prisma.inventoryStock.count({ where }),
  ]);

  const views = rows.map(toStockView);

  // The reorder test compares two columns, which Prisma cannot express in a
  // where clause, so it is applied to the mapped page rather than in SQL.
  if (!query.needsReorder) return { rows: views, total };

  const flagged = views.filter((row) => row.needsReorder);
  return { rows: flagged, total: flagged.length };
}

async function readStock(id: string): Promise<InventoryStockView> {
  const row = await prisma.inventoryStock.findUnique({ where: { id }, include: stockInclude });
  if (!row) throw new NotFoundError('Inventory stock', id);
  return toStockView(row);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

interface StockTarget {
  warehouseId: string;
  productId: string;
  productVariantId?: string | null;
}

/**
 * Checks the row a movement addresses actually exists and can hold stock, and
 * returns the variant id normalised to null.
 */
async function resolveTarget(
  tx: Prisma.TransactionClient,
  target: StockTarget,
): Promise<{ productVariantId: string | null; warehouseCode: string; productSku: string }> {
  const warehouse = await tx.warehouse.findUnique({ where: { id: target.warehouseId } });
  if (!warehouse) throw new NotFoundError('Warehouse', target.warehouseId);
  if (!warehouse.isActive) {
    throw new ConflictError(`Warehouse ${warehouse.code} is deactivated and cannot hold stock`);
  }

  const product = await tx.product.findUnique({ where: { id: target.productId } });
  if (!product) throw new NotFoundError('Product', target.productId);

  const productVariantId = target.productVariantId ?? null;
  if (productVariantId !== null) {
    const variant = await tx.productVariant.findUnique({ where: { id: productVariantId } });
    if (!variant) throw new NotFoundError('Product variant', productVariantId);
    if (variant.productId !== target.productId) {
      throw new ValidationError('That variant belongs to a different product');
    }
  }

  return { productVariantId, warehouseCode: warehouse.code, productSku: product.sku };
}

/** The stock row for a target, or null when the warehouse has never held it. */
function findRow(tx: Prisma.TransactionClient, target: StockTarget & { productVariantId: string | null }) {
  // A compound unique containing a null is not matched by findUnique, so the
  // row is located the same way the fulfillment module locates it.
  return tx.inventoryStock.findFirst({
    where: {
      warehouseId: target.warehouseId,
      productId: target.productId,
      productVariantId: target.productVariantId,
    },
  });
}

/**
 * Writes onHand and keeps `available` in step with it. Reserved is never
 * touched here: stock promised to a shipment stays promised.
 */
async function writeOnHand(
  tx: Prisma.TransactionClient,
  rowId: string,
  onHand: Prisma.Decimal,
  reserved: Prisma.Decimal,
): Promise<void> {
  await tx.inventoryStock.update({
    where: { id: rowId },
    data: { onHand, available: onHand.minus(reserved) },
  });
}

/**
 * Goods receipt: stock arrives at a warehouse.
 *
 * The first receipt for a product a warehouse has never carried opens the row,
 * which is also what makes the product stock tracked as far as the allocator is
 * concerned — it treats a product with no stock rows anywhere as not shippable.
 */
export async function receiveStock(
  body: ReceiveBody,
  actorUserId: string,
): Promise<StockMovementResult> {
  const quantity = D(body.quantity);

  const { rowId, outcome, before, after } = await prisma.$transaction(async (tx) => {
    const { productVariantId, warehouseCode, productSku } = await resolveTarget(tx, body);
    const existing = await findRow(tx, { ...body, productVariantId });

    if (existing) {
      const onHand = existing.onHand.plus(quantity);
      await writeOnHand(tx, existing.id, onHand, existing.reserved);

      await recordAudit(tx, {
        entityType: 'inventory_stock',
        entityId: existing.id,
        action: AuditAction.UPDATE,
        userId: actorUserId,
        reason: body.reference
          ? `Received ${quantity.toFixed(2)} of ${productSku} into ${warehouseCode} (${body.reference})`
          : `Received ${quantity.toFixed(2)} of ${productSku} into ${warehouseCode}`,
        changes: {
          movement: 'RECEIPT',
          quantity: quantity.toFixed(2),
          reference: body.reference ?? null,
          onHand: { from: existing.onHand.toFixed(2), to: onHand.toFixed(2) },
        },
      });

      return {
        rowId: existing.id,
        outcome: 'UPDATED' as const,
        before: existing.onHand,
        after: onHand,
      };
    }

    const created = await tx.inventoryStock.create({
      data: {
        warehouseId: body.warehouseId,
        productId: body.productId,
        productVariantId,
        onHand: quantity,
        reserved: D(0),
        available: quantity,
      },
    });

    await recordAudit(tx, {
      entityType: 'inventory_stock',
      entityId: created.id,
      action: AuditAction.CREATE,
      userId: actorUserId,
      reason: body.reference
        ? `Opened stock for ${productSku} in ${warehouseCode} with ${quantity.toFixed(2)} (${body.reference})`
        : `Opened stock for ${productSku} in ${warehouseCode} with ${quantity.toFixed(2)}`,
      changes: {
        movement: 'RECEIPT',
        quantity: quantity.toFixed(2),
        reference: body.reference ?? null,
        onHand: { from: '0.00', to: quantity.toFixed(2) },
      },
    });

    return { rowId: created.id, outcome: 'CREATED' as const, before: D(0), after: quantity };
  });

  return {
    outcome,
    onHandBefore: before.toFixed(2),
    onHandAfter: after.toFixed(2),
    stock: await readStock(rowId),
  };
}

/**
 * A counted correction. `newOnHand` sets the level a physical count found;
 * `delta` moves it by a signed amount for shrinkage, damage or a found pallet.
 *
 * Neither may take onHand below `reserved` — that stock is already promised to
 * a shipment, and letting the count go under it would make `available` negative
 * and hand the allocator a lie.
 */
export async function adjustStock(
  body: AdjustBody,
  actorUserId: string,
): Promise<StockMovementResult> {
  const { rowId, before, after } = await prisma.$transaction(async (tx) => {
    const { productVariantId, warehouseCode, productSku } = await resolveTarget(tx, body);
    const existing = await findRow(tx, { ...body, productVariantId });
    if (!existing) {
      throw new NotFoundError(
        'Inventory stock',
        `${productSku} in ${warehouseCode} — receive stock first to open the row`,
      );
    }

    const onHand =
      body.newOnHand !== undefined ? D(body.newOnHand) : existing.onHand.plus(D(body.delta ?? 0));

    if (onHand.lessThan(0)) {
      throw new ValidationError(
        `That adjustment would leave ${onHand.toFixed(2)} on hand; stock cannot go negative`,
      );
    }
    if (onHand.lessThan(existing.reserved)) {
      throw new ConflictError(
        `${existing.reserved.toFixed(2)} of ${productSku} is reserved for shipments in ` +
          `${warehouseCode}, so on hand cannot be set to ${onHand.toFixed(2)}`,
      );
    }

    await writeOnHand(tx, existing.id, onHand, existing.reserved);

    await recordAudit(tx, {
      entityType: 'inventory_stock',
      entityId: existing.id,
      action: AuditAction.MANUAL_OVERRIDE,
      userId: actorUserId,
      // The reason is mandatory on the way in precisely so it lands here.
      reason: body.reason,
      changes: {
        movement: 'ADJUSTMENT',
        mode: body.newOnHand !== undefined ? 'ABSOLUTE' : 'DELTA',
        onHand: { from: existing.onHand.toFixed(2), to: onHand.toFixed(2) },
        reserved: existing.reserved.toFixed(2),
      },
    });

    return { rowId: existing.id, before: existing.onHand, after: onHand };
  });

  return {
    outcome: 'UPDATED',
    onHandBefore: before.toFixed(2),
    onHandAfter: after.toFixed(2),
    stock: await readStock(rowId),
  };
}

/** The level at which this warehouse should reorder this product. */
export async function setReorderPoint(
  id: string,
  body: ReorderPointBody,
  actorUserId: string,
): Promise<StockMovementResult> {
  const existing = await prisma.inventoryStock.findUnique({ where: { id }, include: stockInclude });
  if (!existing) throw new NotFoundError('Inventory stock', id);

  const reorderPoint = D(body.reorderPoint);

  await prisma.$transaction(async (tx) => {
    await tx.inventoryStock.update({ where: { id }, data: { reorderPoint } });

    await recordAudit(tx, {
      entityType: 'inventory_stock',
      entityId: id,
      action: AuditAction.UPDATE,
      userId: actorUserId,
      reason:
        `Reorder point for ${existing.product.sku} in ${existing.warehouse.code} set to ` +
        reorderPoint.toFixed(2),
      changes: {
        reorderPoint: { from: existing.reorderPoint.toFixed(2), to: reorderPoint.toFixed(2) },
      },
    });
  });

  return {
    outcome: 'UPDATED',
    // A reorder point moves no stock, so the level is unchanged on both sides.
    onHandBefore: existing.onHand.toFixed(2),
    onHandAfter: existing.onHand.toFixed(2),
    stock: await readStock(id),
  };
}
