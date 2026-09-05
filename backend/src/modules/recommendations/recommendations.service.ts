// Upsell / cross-sell suggestions (specs.md §4).
//
// Two candidate streams, one ranked list: explicit merchandised pairs from
// product_recommendation, plus every healthy-margin product in the catalogue.
// Both streams are scored live from the product's own list price and unit
// cost — the stored margin_delta column is the seed's snapshot of the same
// computation, not an input. Reads never write.

import { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma-client';
import { NotFoundError } from '../../lib/errors';

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const HUNDRED = D(100);

/** A suggestion prices one unit at list, with no discount. */
const SUGGESTED_QUANTITY = D(1);

/**
 * Global healthy-margin cutoff, in percent. A pair may set its own
 * min_margin_pct; a zero there means "use this". Only items earning twenty
 * points of margin get suggested.
 */
const MIN_MARGIN_PCT = D(20);

/** A panel names names, not pages. */
const MAX_SUGGESTIONS = 5;

interface CandidateProduct {
  id: string;
  sku: string;
  name: string;
  listPrice: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  category: { id: string; code: string; name: string };
}

interface Candidate {
  recommendationId: string | null;
  product: CandidateProduct;
  thresholdPct: Prisma.Decimal;
  promotionTag: string | null;
  rank: number;
}

function toCandidateProduct(product: {
  id: string;
  sku: string;
  name: string;
  listPrice: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  category: { id: string; code: string; name: string };
}): CandidateProduct {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    listPrice: product.listPrice,
    unitCost: product.unitCost,
    category: product.category,
  };
}

export async function getRecommendations(quotationId: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    select: { id: true, lines: { select: { productId: true } } },
  });
  if (!quotation) {
    throw new NotFoundError('Quotation', quotationId);
  }

  const inQuote = new Set(quotation.lines.map((line) => line.productId));

  // Explicit pairs first: they carry the merchandiser's tag and rank.
  const pairs = await prisma.productRecommendation.findMany({
    where: { isActive: true, sourceProductId: { in: [...inQuote] } },
    include: {
      recommendedProduct: {
        include: { category: { select: { id: true, code: true, name: true } } },
      },
    },
  });

  const byProductId = new Map<string, Candidate>();
  for (const pair of pairs) {
    const product = pair.recommendedProduct;
    if (!product.isActive || product.listPrice.lte(0) || inQuote.has(product.id)) {
      continue;
    }
    byProductId.set(product.id, {
      recommendationId: pair.id,
      product: toCandidateProduct(product),
      thresholdPct: pair.minMarginPct.gt(0) ? pair.minMarginPct : MIN_MARGIN_PCT,
      promotionTag: pair.promotionTag,
      rank: pair.rank,
    });
  }

  // Rule-based stream: the healthy catalogue, minus what is already quoted
  // or already suggested above. A pair always wins the dedupe.
  const catalog = await prisma.product.findMany({
    where: { isActive: true, listPrice: { gt: 0 } },
    include: { category: { select: { id: true, code: true, name: true } } },
  });
  for (const product of catalog) {
    if (inQuote.has(product.id) || byProductId.has(product.id)) {
      continue;
    }
    byProductId.set(product.id, {
      recommendationId: null,
      product: toCandidateProduct(product),
      thresholdPct: MIN_MARGIN_PCT,
      promotionTag: null,
      rank: 0,
    });
  }

  // Margin semantics match the quote engine's own (margin over selling
  // price): delta = (list - cost) × qty, pct = delta / selling × 100.
  // Ranked by margin delta, rank breaking the ties.
  const rows = [...byProductId.values()]
    .map((candidate) => {
      const selling = candidate.product.listPrice.mul(SUGGESTED_QUANTITY);
      const cost = candidate.product.unitCost.mul(SUGGESTED_QUANTITY);
      const marginDelta = selling.minus(cost).toDecimalPlaces(2);
      const marginPct = selling.isZero()
        ? D(0)
        : marginDelta.div(selling).mul(HUNDRED).toDecimalPlaces(2);
      return { candidate, marginDelta, marginPct };
    })
    .filter((row) => row.marginPct.gte(row.candidate.thresholdPct))
    .sort(
      (a, b) =>
        b.marginDelta.minus(a.marginDelta).toNumber() || a.candidate.rank - b.candidate.rank,
    )
    .slice(0, MAX_SUGGESTIONS)
    .map((row) => ({
      recommendationId: row.candidate.recommendationId,
      product: {
        id: row.candidate.product.id,
        sku: row.candidate.product.sku,
        name: row.candidate.product.name,
        category: row.candidate.product.category,
      },
      suggestedQuantity: SUGGESTED_QUANTITY.toNumber(),
      listPrice: row.candidate.product.listPrice,
      marginDelta: row.marginDelta,
      marginPct: row.marginPct,
      promotionTag: row.candidate.promotionTag,
    }));

  return { rows, total: rows.length };
}
