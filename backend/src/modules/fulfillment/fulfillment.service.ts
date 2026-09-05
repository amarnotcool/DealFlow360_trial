// Fulfillment business logic and Prisma access.
//
// The split maths is NOT repeated here: warehouses and inventory_stock are read
// from the database, handed to the pure allocator in split-allocator.ts, and its
// result is persisted. Nothing in this file decides an allocation itself.
//
// Fulfillment anchors on sales_order, never on the quotation: a quote becomes an
// order through POST /quotations/:id/confirm, and only CONFIRMED or
// PARTIALLY_FULFILLED orders are eligible.

import {
  AuditAction,
  BackorderStatus,
  FulfillmentStatus,
  Prisma,
  SalesOrderStatus,
  SplitSuggestionStatus,
  LineType,
} from '@prisma/client';
import type { SplitAllocatorInput, SplitAllocatorResult } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import { allocateSplit } from './split-allocator';

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

/** The statuses an order can still be fulfilled from. */
const OPEN_ORDER_STATUSES: SalesOrderStatus[] = [
  SalesOrderStatus.CONFIRMED,
  SalesOrderStatus.PARTIALLY_FULFILLED,
];

const salesOrderDetailInclude = {
  customer: { select: { id: true, code: true, name: true } },
  quotation: { select: { id: true, number: true, status: true } },
  lines: {
    orderBy: { sequence: 'asc' },
    include: {
      product: { select: { id: true, sku: true, name: true } },
      productVariant: { select: { id: true, sku: true, name: true } },
    },
  },
  fulfillments: {
    orderBy: { createdAt: 'asc' },
    include: { warehouse: { select: { id: true, code: true, name: true } } },
  },
  backorders: {
    orderBy: { createdAt: 'asc' },
    include: { salesOrderLine: { select: { id: true, productId: true, sequence: true } } },
  },
  splitSuggestions: { orderBy: { generatedAt: 'desc' } },
} satisfies Prisma.SalesOrderInclude;

type SalesOrderDetail = Prisma.SalesOrderGetPayload<{ include: typeof salesOrderDetailInclude }>;

// ---------------------------------------------------------------------------
// Allocator input — the only place the allocator's numbers come from
// ---------------------------------------------------------------------------

/** A line the allocator was not asked about, and why. */
export interface SkippedLine {
  salesOrderLineId: string;
  productId: string;
  reason: 'RECURRING' | 'NOT_STOCK_TRACKED' | 'ALREADY_FULFILLED';
}

interface AllocatorContext {
  input: SplitAllocatorInput;
  skipped: SkippedLine[];
  /** Product and variant per line id, so an allocation can find its stock row. */
  lineProduct: Map<string, { productId: string; productVariantId: string | null }>;
}

/**
 * Builds the allocator input for an order.
 *
 * Only ONE_TIME lines with an outstanding quantity are allocated, and only when
 * the product is stock tracked (it has at least one inventory_stock row).
 * Recurring lines and non-stock items such as a setup service ship nothing and
 * are never backordered — they are reported as skipped instead.
 */
async function buildAllocatorContext(
  client: Prisma.TransactionClient,
  order: SalesOrderDetail,
): Promise<AllocatorContext> {
  const productIds = [...new Set(order.lines.map((line) => line.productId))];

  const [warehouses, stockRows] = await Promise.all([
    client.warehouse.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } }),
    client.inventoryStock.findMany({ where: { productId: { in: productIds } } }),
  ]);

  const stockTrackedProducts = new Set(stockRows.map((row) => row.productId));

  const skipped: SkippedLine[] = [];
  const lineProduct = new Map<string, { productId: string; productVariantId: string | null }>();
  const lines: SplitAllocatorInput['lines'] = [];

  for (const line of order.lines) {
    const outstanding = line.quantity.minus(line.quantityFulfilled);

    if (line.lineType === LineType.RECURRING) {
      skipped.push({ salesOrderLineId: line.id, productId: line.productId, reason: 'RECURRING' });
      continue;
    }
    if (!stockTrackedProducts.has(line.productId)) {
      skipped.push({ salesOrderLineId: line.id, productId: line.productId, reason: 'NOT_STOCK_TRACKED' });
      continue;
    }
    if (outstanding.lessThanOrEqualTo(0)) {
      skipped.push({ salesOrderLineId: line.id, productId: line.productId, reason: 'ALREADY_FULFILLED' });
      continue;
    }

    lineProduct.set(line.id, { productId: line.productId, productVariantId: line.productVariantId });
    lines.push({
      lineId: line.id,
      productId: line.productId,
      productVariantId: line.productVariantId,
      requiredQty: outstanding.toNumber(),
    });
  }

  return {
    skipped,
    lineProduct,
    input: {
      warehouses: warehouses.map((warehouse) => ({
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        shippingCostWeight: warehouse.shippingCostWeight.toNumber(),
      })),
      stock: stockRows.map((row) => ({
        warehouseId: row.warehouseId,
        productId: row.productId,
        productVariantId: row.productVariantId,
        availableQty: row.available.toNumber(),
      })),
      lines,
    },
  };
}

async function loadOrder(
  client: Prisma.TransactionClient,
  salesOrderId: string,
): Promise<SalesOrderDetail> {
  const order = await client.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: salesOrderDetailInclude,
  });

  if (!order) {
    throw new NotFoundError('Sales order', salesOrderId);
  }

  return order;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListFulfillmentParams {
  skip: number;
  take: number;
}

/** Screen 7: orders awaiting fulfillment, plus live stock per warehouse. */
export async function listFulfillment(params: ListFulfillmentParams) {
  const where: Prisma.SalesOrderWhereInput = { status: { in: OPEN_ORDER_STATUSES } };

  const [rows, total, warehouses] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      skip: params.skip,
      take: params.take,
      include: {
        customer: { select: { id: true, code: true, name: true } },
        quotation: { select: { id: true, number: true } },
        splitSuggestions: { orderBy: { generatedAt: 'desc' }, take: 1 },
        _count: { select: { lines: true, fulfillments: true, backorders: true } },
      },
    }),
    prisma.salesOrder.count({ where }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      include: {
        inventoryStock: {
          orderBy: { productId: 'asc' },
          include: {
            product: { select: { id: true, sku: true, name: true } },
            productVariant: { select: { id: true, sku: true, name: true } },
          },
        },
      },
    }),
  ]);

  const stock = warehouses.map((warehouse) => ({
    id: warehouse.id,
    code: warehouse.code,
    name: warehouse.name,
    shippingCostWeight: warehouse.shippingCostWeight,
    lines: warehouse.inventoryStock.map((row) => ({
      productId: row.productId,
      sku: row.productVariant?.sku ?? row.product.sku,
      name: row.productVariant ? `${row.product.name} — ${row.productVariant.name}` : row.product.name,
      onHand: row.onHand,
      reserved: row.reserved,
      available: row.available,
    })),
  }));

  const summarised = rows.map(({ splitSuggestions, ...rest }) => ({
    ...rest,
    latestSuggestion: splitSuggestions[0] ?? null,
  }));

  return { rows: summarised, total, warehouses: stock };
}

/** Screen 8: the order, the split the allocator suggests right now, and backorders. */
export async function getFulfillment(salesOrderId: string) {
  const order = await loadOrder(prisma, salesOrderId);
  const context = await buildAllocatorContext(prisma, order);

  // Computed on read so the screen always shows what current stock allows.
  // Reads never write: persisting a suggestion is POST /suggest-split.
  const suggestion = allocateSplit(context.input);
  const { splitSuggestions, ...rest } = order;

  return {
    ...rest,
    suggestions: splitSuggestions,
    latestSuggestion: splitSuggestions[0] ?? null,
    suggestedSplit: decorateSuggestion(order, suggestion, context.skipped),
  };
}

/** Attaches the product names a screen needs to the raw allocator output. */
function decorateSuggestion(
  order: SalesOrderDetail,
  result: SplitAllocatorResult,
  skipped: SkippedLine[],
) {
  const lineById = new Map(order.lines.map((line) => [line.id, line]));

  return {
    ...result,
    lines: result.lines.map((line) => {
      const orderLine = lineById.get(line.lineId);
      return {
        ...line,
        salesOrderLineId: line.lineId,
        productId: orderLine?.productId ?? null,
        description: orderLine
          ? orderLine.productVariant
            ? `${orderLine.product.name} — ${orderLine.productVariant.name}`
            : orderLine.product.name
          : null,
      };
    }),
    skipped: skipped.map((entry) => ({
      ...entry,
      description: lineById.get(entry.salesOrderLineId)?.product.name ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function assertFulfillable(order: SalesOrderDetail): void {
  if (!OPEN_ORDER_STATUSES.includes(order.status)) {
    throw new ConflictError(`Sales order in status ${order.status} is not open for fulfillment`);
  }
}

function assertNotAlreadyFulfilled(order: SalesOrderDetail): void {
  if (order.fulfillments.length > 0) {
    throw new ConflictError(
      `Sales order ${order.number} already has fulfillments — accept or override runs once`,
    );
  }
}

/** Runs the allocator and stores the result as a SUGGESTED split. */
export async function suggestSplit(salesOrderId: string, actorUserId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, salesOrderId);
    assertFulfillable(order);
    assertNotAlreadyFulfilled(order);

    const context = await buildAllocatorContext(tx, order);
    const result = allocateSplit(context.input);

    // An earlier untouched suggestion is superseded, not left ambiguous.
    await tx.fulfillmentSplitSuggestion.updateMany({
      where: { salesOrderId, status: SplitSuggestionStatus.SUGGESTED },
      data: { status: SplitSuggestionStatus.REJECTED },
    });

    const created = await tx.fulfillmentSplitSuggestion.create({
      data: {
        salesOrderId,
        status: SplitSuggestionStatus.SUGGESTED,
        estimatedShipmentCount: result.estimatedShipmentCount,
        estimatedCost: D(result.estimatedCost),
        payload: toPayload(result, context.skipped),
      },
    });

    await recordAudit(tx, {
      entityType: 'fulfillment_split_suggestion',
      entityId: created.id,
      action: AuditAction.CREATE,
      userId: actorUserId,
      reason: `Split suggested across ${result.estimatedShipmentCount} warehouse(s)`,
      changes: { salesOrderId, backorderQty: result.totalBackorderQty },
    });
  });

  return getFulfillment(salesOrderId);
}

function toPayload(
  result: SplitAllocatorResult,
  skipped: SkippedLine[],
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify({ ...result, skipped })) as Prisma.InputJsonValue;
}

/** One warehouse's worth of an accepted or overridden allocation. */
interface ShipmentPlan {
  warehouseId: string;
  lines: Array<{ salesOrderLineId: string; productId: string; productVariantId: string | null; quantity: Prisma.Decimal }>;
}

/**
 * Moves stock from available to reserved on the row the allocation drew from.
 * A line for a variant falls back to the product-level row, exactly as the
 * allocator does when no variant-level row exists.
 */
async function reserveStock(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
  productVariantId: string | null,
  quantity: Prisma.Decimal,
): Promise<void> {
  let row = await tx.inventoryStock.findFirst({ where: { warehouseId, productId, productVariantId } });
  if (!row && productVariantId !== null) {
    row = await tx.inventoryStock.findFirst({ where: { warehouseId, productId, productVariantId: null } });
  }
  if (!row) {
    throw new ConflictError(`No stock row for product ${productId} in warehouse ${warehouseId}`);
  }
  if (row.available.lessThan(quantity)) {
    throw new ConflictError(
      `Warehouse ${warehouseId} has ${row.available.toString()} available but ${quantity.toString()} was allocated`,
    );
  }

  await tx.inventoryStock.update({
    where: { id: row.id },
    data: { reserved: row.reserved.plus(quantity), available: row.available.minus(quantity) },
  });
}

/**
 * Writes the fulfillment rows for a plan, reserves the stock behind them, and
 * opens a backorder for every line the plan leaves short. One transaction, so
 * stock and fulfillment can never disagree.
 */
async function materialise(
  tx: Prisma.TransactionClient,
  order: SalesOrderDetail,
  plans: ShipmentPlan[],
  suggestionId: string,
  isManualOverride: boolean,
): Promise<{ fulfillmentIds: string[]; backorderIds: string[] }> {
  const warehouses = await tx.warehouse.findMany({
    where: { id: { in: plans.map((plan) => plan.warehouseId) } },
  });
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));

  const fulfillmentIds: string[] = [];
  const allocatedByLine = new Map<string, Prisma.Decimal>();

  for (const plan of plans) {
    const warehouse = warehouseById.get(plan.warehouseId);
    if (!warehouse) {
      throw new NotFoundError('Warehouse', plan.warehouseId);
    }

    for (const line of plan.lines) {
      await reserveStock(tx, plan.warehouseId, line.productId, line.productVariantId, line.quantity);
      allocatedByLine.set(
        line.salesOrderLineId,
        (allocatedByLine.get(line.salesOrderLineId) ?? D(0)).plus(line.quantity),
      );
    }

    const fulfillment = await tx.fulfillment.create({
      data: {
        salesOrderId: order.id,
        warehouseId: plan.warehouseId,
        splitSuggestionId: suggestionId,
        status: FulfillmentStatus.RESERVED,
        isManualOverride,
        shippingCost: warehouse.shippingCostWeight,
        lines: JSON.parse(
          JSON.stringify(
            plan.lines.map((line) => ({
              salesOrderLineId: line.salesOrderLineId,
              productId: line.productId,
              productVariantId: line.productVariantId,
              quantity: line.quantity.toString(),
            })),
          ),
        ) as Prisma.InputJsonValue,
      },
    });

    fulfillmentIds.push(fulfillment.id);
  }

  // Anything the plan could not cover becomes an open backorder.
  const backorderIds: string[] = [];
  for (const line of order.lines) {
    if (line.lineType === LineType.RECURRING) continue;

    const outstanding = line.quantity.minus(line.quantityFulfilled);
    const allocated = allocatedByLine.get(line.id) ?? D(0);
    if (allocated.greaterThanOrEqualTo(outstanding) || outstanding.lessThanOrEqualTo(0)) continue;

    // A line nothing was allocated for is only short if it was stock tracked at
    // all — a setup service ships nothing and is never backordered.
    const isStockTracked = (await tx.inventoryStock.count({ where: { productId: line.productId } })) > 0;
    if (!isStockTracked) continue;

    const backorder = await tx.backorder.create({
      data: {
        salesOrderId: order.id,
        salesOrderLineId: line.id,
        status: BackorderStatus.OPEN,
        quantity: outstanding.minus(allocated),
      },
    });
    backorderIds.push(backorder.id);
  }

  return { fulfillmentIds, backorderIds };
}

export interface AcceptSplitInput {
  actorUserId: string;
  suggestionId?: string | null;
}

/** Accepts the stored suggestion as it stands: fulfillments, reservations, backorders. */
export async function acceptSplit(salesOrderId: string, input: AcceptSplitInput) {
  await prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, salesOrderId);
    assertFulfillable(order);
    assertNotAlreadyFulfilled(order);

    const suggestion = input.suggestionId
      ? order.splitSuggestions.find((row) => row.id === input.suggestionId)
      : order.splitSuggestions.find((row) => row.status === SplitSuggestionStatus.SUGGESTED);

    if (!suggestion) {
      throw new NotFoundError('Split suggestion', input.suggestionId ?? salesOrderId);
    }
    if (suggestion.status !== SplitSuggestionStatus.SUGGESTED) {
      throw new ConflictError(`Split suggestion is ${suggestion.status} and cannot be accepted`);
    }

    const context = await buildAllocatorContext(tx, order);
    const stored = suggestion.payload as unknown as SplitAllocatorResult;

    const plans: ShipmentPlan[] = stored.shipments.map((shipment) => ({
      warehouseId: shipment.warehouseId,
      lines: shipment.lines.map((line) => {
        const product = context.lineProduct.get(line.lineId);
        if (!product) {
          throw new ConflictError(
            `Suggestion references line ${line.lineId}, which is no longer allocatable — suggest the split again`,
          );
        }
        return {
          salesOrderLineId: line.lineId,
          productId: product.productId,
          productVariantId: product.productVariantId,
          quantity: D(line.quantity),
        };
      }),
    }));

    const { fulfillmentIds, backorderIds } = await materialise(tx, order, plans, suggestion.id, false);

    await tx.fulfillmentSplitSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: SplitSuggestionStatus.ACCEPTED,
        acceptedByUserId: input.actorUserId,
        acceptedAt: new Date(),
      },
    });

    await recordAudit(tx, {
      entityType: 'fulfillment_split_suggestion',
      entityId: suggestion.id,
      action: AuditAction.UPDATE,
      userId: input.actorUserId,
      reason: 'Suggested split accepted as generated',
      changes: { salesOrderId, fulfillmentIds, backorderIds },
    });
  });

  return getFulfillment(salesOrderId);
}

export interface OverrideAllocationInput {
  salesOrderLineId: string;
  warehouseId: string;
  quantity: number;
}

export interface OverrideSplitInput {
  actorUserId: string;
  reason?: string | null;
  allocations: OverrideAllocationInput[];
}

/**
 * Replaces the suggestion with an allocation the user chose. The allocator's
 * output is not consulted — but the same stock rules still apply, so an
 * override can never reserve stock a warehouse does not have.
 */
export async function overrideSplit(salesOrderId: string, input: OverrideSplitInput) {
  await prisma.$transaction(async (tx) => {
    const order = await loadOrder(tx, salesOrderId);
    assertFulfillable(order);
    assertNotAlreadyFulfilled(order);

    if (input.allocations.length === 0) {
      throw new ValidationError('A manual override needs at least one allocation');
    }

    const context = await buildAllocatorContext(tx, order);
    const lineById = new Map(order.lines.map((line) => [line.id, line]));
    const requestedByLine = new Map<string, Prisma.Decimal>();
    const byWarehouse = new Map<string, ShipmentPlan>();

    for (const allocation of input.allocations) {
      const line = lineById.get(allocation.salesOrderLineId);
      if (!line) {
        throw new NotFoundError('Sales order line', allocation.salesOrderLineId);
      }
      if (allocation.quantity <= 0) {
        throw new ValidationError(`Allocation for line ${allocation.salesOrderLineId} must be positive`);
      }

      const product = context.lineProduct.get(line.id);
      if (!product) {
        throw new ValidationError(
          `Line ${line.id} is not stock tracked or has nothing outstanding, so it cannot be allocated`,
        );
      }

      const quantity = D(allocation.quantity);
      const requested = (requestedByLine.get(line.id) ?? D(0)).plus(quantity);
      const outstanding = line.quantity.minus(line.quantityFulfilled);
      if (requested.greaterThan(outstanding)) {
        throw new ValidationError(
          `Line ${line.id} has ${outstanding.toString()} outstanding but ${requested.toString()} was allocated`,
        );
      }
      requestedByLine.set(line.id, requested);

      const plan = byWarehouse.get(allocation.warehouseId) ?? {
        warehouseId: allocation.warehouseId,
        lines: [],
      };
      plan.lines.push({
        salesOrderLineId: line.id,
        productId: product.productId,
        productVariantId: product.productVariantId,
        quantity,
      });
      byWarehouse.set(allocation.warehouseId, plan);
    }

    // The override supersedes whatever was suggested; if nothing was suggested
    // the override is still recorded as the split that was used.
    const open = order.splitSuggestions.find((row) => row.status === SplitSuggestionStatus.SUGGESTED);
    const plans = [...byWarehouse.values()];

    const suggestion = open
      ? await tx.fulfillmentSplitSuggestion.update({
          where: { id: open.id },
          data: {
            status: SplitSuggestionStatus.OVERRIDDEN,
            isManualOverride: true,
            estimatedShipmentCount: plans.length,
            estimatedCost: await estimateCost(tx, plans),
            acceptedByUserId: input.actorUserId,
            acceptedAt: new Date(),
          },
        })
      : await tx.fulfillmentSplitSuggestion.create({
          data: {
            salesOrderId,
            status: SplitSuggestionStatus.OVERRIDDEN,
            isManualOverride: true,
            estimatedShipmentCount: plans.length,
            estimatedCost: await estimateCost(tx, plans),
            acceptedByUserId: input.actorUserId,
            acceptedAt: new Date(),
            payload: {},
          },
        });

    await tx.fulfillmentSplitSuggestion.update({
      where: { id: suggestion.id },
      data: {
        payload: JSON.parse(
          JSON.stringify({
            manualOverride: true,
            allocations: input.allocations,
            reason: input.reason ?? null,
          }),
        ) as Prisma.InputJsonValue,
      },
    });

    const { fulfillmentIds, backorderIds } = await materialise(tx, order, plans, suggestion.id, true);

    await recordAudit(tx, {
      entityType: 'fulfillment_split_suggestion',
      entityId: suggestion.id,
      action: AuditAction.MANUAL_OVERRIDE,
      userId: input.actorUserId,
      reason: input.reason ?? 'Suggested split overridden manually',
      changes: JSON.parse(
        JSON.stringify({ salesOrderId, allocations: input.allocations, fulfillmentIds, backorderIds }),
      ) as Prisma.InputJsonValue,
    });
  });

  return getFulfillment(salesOrderId);
}

async function estimateCost(
  tx: Prisma.TransactionClient,
  plans: ShipmentPlan[],
): Promise<Prisma.Decimal> {
  const warehouses = await tx.warehouse.findMany({
    where: { id: { in: plans.map((plan) => plan.warehouseId) } },
    select: { shippingCostWeight: true },
  });

  return warehouses
    .reduce((sum, warehouse) => sum.plus(warehouse.shippingCostWeight), D(0))
    .toDecimalPlaces(2);
}
