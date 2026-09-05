// Catalogue business logic and Prisma access.
//
// Two rules carry real weight here:
//
//  * A product is referenced by quotation lines, order lines, stock rows and
//    price lists. Removing one that is in use would break history, so a product
//    in use is deactivated instead of deleted — the delete endpoint reports
//    which of the two it did rather than silently doing the other one.
//  * `isSubscription` and `recurringCycle` must agree. The billing engine reads
//    the cycle to schedule periods, so a subscription product without a cycle
//    would confirm into a subscription nobody can bill.

import { AuditAction, Prisma } from '@prisma/client';
import type { BillingCycle } from '@dealflow360/shared';
import type {
  CategoryView,
  ProductDeleteResult,
  ProductDetailView,
  ProductListItem,
  ProductVariantView,
} from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors';
import { recordAudit } from '../../shared/audit/audit.service';
import type {
  CreateProductBody,
  CreateVariantBody,
  ListQuery,
  UpdateProductBody,
  UpdateVariantBody,
} from './products.schemas';

const productDetailInclude = {
  category: true,
  variants: { orderBy: { name: 'asc' } },
  priceListItems: {
    include: {
      priceList: { select: { id: true, code: true, name: true, currency: true } },
      productVariant: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  inventoryStock: {
    include: { warehouse: { select: { id: true, code: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ProductInclude;

type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

const productListInclude = {
  category: true,
  variants: { orderBy: { name: 'asc' } },
} satisfies Prisma.ProductInclude;

type ProductListRow = Prisma.ProductGetPayload<{ include: typeof productListInclude }>;

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function toCategoryView(row: { id: string; code: string; name: string; isActive: boolean }): CategoryView {
  return { id: row.id, code: row.code, name: row.name, isActive: row.isActive };
}

function toVariantView(row: {
  id: string;
  sku: string;
  name: string;
  extraPrice: Prisma.Decimal;
  isActive: boolean;
}): ProductVariantView {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    extraPrice: row.extraPrice.toFixed(2),
    isActive: row.isActive,
  };
}

function toListItem(row: ProductListRow): ProductListItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: toCategoryView(row.category),
    listPrice: row.listPrice.toFixed(2),
    unitCost: row.unitCost.toFixed(2),
    isSubscription: row.isSubscription,
    recurringCycle: row.recurringCycle as BillingCycle | null,
    isActive: row.isActive,
    variants: row.variants.map(toVariantView),
  };
}

function toDetailView(row: ProductDetailRow, usageCount: number): ProductDetailView {
  return {
    ...toListItem(row),
    description: row.description,
    priceListEntries: row.priceListItems.map((item) => ({
      id: item.id,
      priceListId: item.priceList.id,
      priceListCode: item.priceList.code,
      priceListName: item.priceList.name,
      currency: item.priceList.currency,
      variantId: item.productVariant?.id ?? null,
      variantName: item.productVariant?.name ?? null,
      unitPrice: item.unitPrice.toFixed(2),
      minQuantity: item.minQuantity.toFixed(2),
    })),
    stock: row.inventoryStock.map((stock) => ({
      warehouseId: stock.warehouse.id,
      warehouseCode: stock.warehouse.code,
      warehouseName: stock.warehouse.name,
      onHand: stock.onHand.toFixed(2),
      reserved: stock.reserved.toFixed(2),
      available: stock.available.toFixed(2),
    })),
    usageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listProducts(
  query: ListQuery,
): Promise<{ rows: ProductListItem[]; total: number }> {
  const where: Prisma.ProductWhereInput = {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            { sku: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: productListInclude,
      orderBy: { name: 'asc' },
      skip: query.skip,
      take: query.take,
    }),
    prisma.product.count({ where }),
  ]);

  return { rows: rows.map(toListItem), total };
}

/** Quotation lines are what a delete has to respect, so they are the count. */
async function countUsage(productId: string): Promise<number> {
  return prisma.quotationLine.count({ where: { productId } });
}

export async function getProduct(id: string): Promise<ProductDetailView> {
  const row = await prisma.product.findUnique({ where: { id }, include: productDetailInclude });
  if (!row) throw new NotFoundError('Product', id);

  return toDetailView(row, await countUsage(id));
}

export async function listCategories(includeInactive: boolean): Promise<CategoryView[]> {
  const rows = await prisma.category.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
  });

  return rows.map(toCategoryView);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** A before/after map, narrowed to the JSON the audit column stores. */
function asJson(changes: Record<string, { from: unknown; to: unknown }>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonValue;
}

/** Turns Prisma's unique-constraint failure into the 409 the SKU deserves. */
function asSkuConflict(cause: unknown, sku: string): never {
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
    throw new ConflictError(`SKU ${sku} is already used by another product or variant`);
  }
  throw cause;
}

export async function createProduct(
  body: CreateProductBody,
  actorUserId: string,
): Promise<ProductDetailView> {
  const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
  if (!category) throw new NotFoundError('Category', body.categoryId);

  const created = await prisma
    .$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: body.sku,
          name: body.name,
          categoryId: body.categoryId,
          description: body.description ?? null,
          listPrice: new Prisma.Decimal(body.listPrice),
          unitCost: new Prisma.Decimal(body.unitCost),
          isSubscription: body.isSubscription,
          recurringCycle: body.recurringCycle ?? null,
          variants: {
            create: body.variants.map((variant) => ({
              sku: variant.sku,
              name: variant.name,
              extraPrice: new Prisma.Decimal(variant.extraPrice),
            })),
          },
        },
      });

      await recordAudit(tx, {
        entityType: 'product',
        entityId: product.id,
        action: AuditAction.CREATE,
        userId: actorUserId,
        reason: `Product ${product.sku} added to the catalogue`,
        changes: {
          sku: product.sku,
          name: product.name,
          categoryId: product.categoryId,
          listPrice: product.listPrice.toFixed(2),
          unitCost: product.unitCost.toFixed(2),
          isSubscription: product.isSubscription,
          recurringCycle: product.recurringCycle,
          variants: body.variants.length,
        },
      });

      return product;
    })
    .catch((cause: unknown) => asSkuConflict(cause, body.sku));

  return getProduct(created.id);
}

export async function updateProduct(
  id: string,
  body: UpdateProductBody,
  actorUserId: string,
): Promise<ProductDetailView> {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Product', id);

  if (body.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!category) throw new NotFoundError('Category', body.categoryId);
  }

  // Either half of the pair can move on its own, so the check runs against the
  // row as it will be after the merge, not against the request alone.
  const isSubscription = body.isSubscription ?? existing.isSubscription;
  const recurringCycle =
    body.recurringCycle !== undefined ? body.recurringCycle ?? null : existing.recurringCycle;

  if (isSubscription && recurringCycle == null) {
    throw new ValidationError('A subscription product needs a recurringCycle');
  }
  if (!isSubscription && recurringCycle != null) {
    throw new ValidationError('A one-time product must not have a recurringCycle');
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const record = (field: string, from: unknown, to: unknown) => {
    if (from !== to) changes[field] = { from, to };
  };

  record('sku', existing.sku, body.sku ?? existing.sku);
  record('name', existing.name, body.name ?? existing.name);
  record('categoryId', existing.categoryId, body.categoryId ?? existing.categoryId);
  record(
    'listPrice',
    existing.listPrice.toFixed(2),
    (body.listPrice !== undefined ? new Prisma.Decimal(body.listPrice) : existing.listPrice).toFixed(2),
  );
  record(
    'unitCost',
    existing.unitCost.toFixed(2),
    (body.unitCost !== undefined ? new Prisma.Decimal(body.unitCost) : existing.unitCost).toFixed(2),
  );
  record('isSubscription', existing.isSubscription, isSubscription);
  record('recurringCycle', existing.recurringCycle, recurringCycle);
  record('isActive', existing.isActive, body.isActive ?? existing.isActive);

  await prisma
    .$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...(body.sku !== undefined ? { sku: body.sku } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.description !== undefined ? { description: body.description ?? null } : {}),
          ...(body.listPrice !== undefined ? { listPrice: new Prisma.Decimal(body.listPrice) } : {}),
          ...(body.unitCost !== undefined ? { unitCost: new Prisma.Decimal(body.unitCost) } : {}),
          isSubscription,
          recurringCycle,
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });

      await recordAudit(tx, {
        entityType: 'product',
        entityId: id,
        action: AuditAction.UPDATE,
        userId: actorUserId,
        reason: `Product ${existing.sku} edited`,
        changes: asJson(changes),
      });
    })
    .catch((cause: unknown) => asSkuConflict(cause, body.sku ?? existing.sku));

  return getProduct(id);
}

/**
 * Deactivates a product that history depends on, and removes one nothing has
 * ever used. The caller is told which happened.
 */
export async function deleteProduct(
  id: string,
  actorUserId: string,
): Promise<ProductDeleteResult> {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Product', id);

  // Every reference that a row deletion would break, not just quotation lines.
  const [quotationLines, orderLines, priceListItems, stockRows, plans, recommendations] =
    await Promise.all([
      prisma.quotationLine.count({ where: { productId: id } }),
      prisma.salesOrderLine.count({ where: { productId: id } }),
      prisma.priceListItem.count({ where: { productId: id } }),
      prisma.inventoryStock.count({ where: { productId: id } }),
      prisma.subscriptionPlan.count({ where: { productId: id } }),
      prisma.productRecommendation.count({
        where: { OR: [{ sourceProductId: id }, { recommendedProductId: id }] },
      }),
    ]);

  const referenced =
    quotationLines + orderLines + priceListItems + stockRows + plans + recommendations > 0;

  if (referenced) {
    if (!existing.isActive) {
      throw new ConflictError(`Product ${existing.sku} is already deactivated`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { isActive: false } });
      await recordAudit(tx, {
        entityType: 'product',
        entityId: id,
        action: AuditAction.UPDATE,
        userId: actorUserId,
        reason: `Product ${existing.sku} deactivated — it is referenced by existing records`,
        changes: {
          isActive: { from: true, to: false },
          references: {
            quotationLines,
            orderLines,
            priceListItems,
            stockRows,
            subscriptionPlans: plans,
            recommendations,
          },
        },
      });
    });

    return {
      id,
      outcome: 'DEACTIVATED',
      usageCount: quotationLines,
      product: await getProduct(id),
    };
  }

  await prisma.$transaction(async (tx) => {
    // Variants cascade with the product; nothing else points at an unused one.
    await tx.product.delete({ where: { id } });
    await recordAudit(tx, {
      entityType: 'product',
      entityId: id,
      action: AuditAction.DELETE,
      userId: actorUserId,
      reason: `Product ${existing.sku} deleted — nothing referenced it`,
      changes: { sku: existing.sku, name: existing.name },
    });
  });

  return { id, outcome: 'DELETED', usageCount: 0, product: null };
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export async function addVariant(
  productId: string,
  body: CreateVariantBody,
  actorUserId: string,
): Promise<ProductDetailView> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new NotFoundError('Product', productId);

  await prisma
    .$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: {
          productId,
          sku: body.sku,
          name: body.name,
          extraPrice: new Prisma.Decimal(body.extraPrice),
        },
      });

      await recordAudit(tx, {
        entityType: 'product_variant',
        entityId: variant.id,
        action: AuditAction.CREATE,
        userId: actorUserId,
        reason: `Variant ${variant.sku} added to ${product.sku}`,
        changes: {
          productId,
          sku: variant.sku,
          name: variant.name,
          extraPrice: variant.extraPrice.toFixed(2),
        },
      });
    })
    .catch((cause: unknown) => asSkuConflict(cause, body.sku));

  return getProduct(productId);
}

export async function updateVariant(
  productId: string,
  variantId: string,
  body: UpdateVariantBody,
  actorUserId: string,
): Promise<ProductDetailView> {
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!existing || existing.productId !== productId) throw new NotFoundError('Variant', variantId);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const record = (field: string, from: unknown, to: unknown) => {
    if (from !== to) changes[field] = { from, to };
  };

  record('sku', existing.sku, body.sku ?? existing.sku);
  record('name', existing.name, body.name ?? existing.name);
  record(
    'extraPrice',
    existing.extraPrice.toFixed(2),
    (body.extraPrice !== undefined
      ? new Prisma.Decimal(body.extraPrice)
      : existing.extraPrice
    ).toFixed(2),
  );
  record('isActive', existing.isActive, body.isActive ?? existing.isActive);

  await prisma
    .$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          ...(body.sku !== undefined ? { sku: body.sku } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.extraPrice !== undefined
            ? { extraPrice: new Prisma.Decimal(body.extraPrice) }
            : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });

      await recordAudit(tx, {
        entityType: 'product_variant',
        entityId: variantId,
        action: AuditAction.UPDATE,
        userId: actorUserId,
        reason: `Variant ${existing.sku} edited`,
        changes: asJson(changes),
      });
    })
    .catch((cause: unknown) => asSkuConflict(cause, body.sku ?? existing.sku));

  return getProduct(productId);
}

/** Same rule as the product: a variant in use is deactivated, never removed. */
export async function deleteVariant(
  productId: string,
  variantId: string,
  actorUserId: string,
): Promise<ProductDeleteResult> {
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!existing || existing.productId !== productId) throw new NotFoundError('Variant', variantId);

  const [quotationLines, orderLines, priceListItems, stockRows] = await Promise.all([
    prisma.quotationLine.count({ where: { productVariantId: variantId } }),
    prisma.salesOrderLine.count({ where: { productVariantId: variantId } }),
    prisma.priceListItem.count({ where: { productVariantId: variantId } }),
    prisma.inventoryStock.count({ where: { productVariantId: variantId } }),
  ]);

  const referenced = quotationLines + orderLines + priceListItems + stockRows > 0;

  if (referenced) {
    if (!existing.isActive) {
      throw new ConflictError(`Variant ${existing.sku} is already deactivated`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
      await recordAudit(tx, {
        entityType: 'product_variant',
        entityId: variantId,
        action: AuditAction.UPDATE,
        userId: actorUserId,
        reason: `Variant ${existing.sku} deactivated — it is referenced by existing records`,
        changes: {
          isActive: { from: true, to: false },
          references: { quotationLines, orderLines, priceListItems, stockRows },
        },
      });
    });

    return {
      id: variantId,
      outcome: 'DEACTIVATED',
      usageCount: quotationLines,
      product: await getProduct(productId),
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.productVariant.delete({ where: { id: variantId } });
    await recordAudit(tx, {
      entityType: 'product_variant',
      entityId: variantId,
      action: AuditAction.DELETE,
      userId: actorUserId,
      reason: `Variant ${existing.sku} deleted — nothing referenced it`,
      changes: { productId, sku: existing.sku, name: existing.name },
    });
  });

  return { id: variantId, outcome: 'DELETED', usageCount: 0, product: await getProduct(productId) };
}
