// Wire shapes for the upsell / cross-sell panel (specs.md §4, screen 4).
//
// A suggestion prices one unit of a product the quote does not already carry,
// at list with no discount. Money and percentages cross as strings, the way
// Prisma serialises Decimal.

export interface RecommendedProductView {
  id: string;
  sku: string;
  name: string;
  category: { id: string; code: string; name: string };
}

export interface RecommendationView {
  /** The pairing row behind this suggestion; null when it is rule-based. */
  recommendationId: string | null;
  product: RecommendedProductView;
  /** The delta below prices this many units at list, with no discount. */
  suggestedQuantity: number;
  listPrice: string;
  /** (listPrice - unitCost) × suggestedQuantity: the margin this line adds. */
  marginDelta: string;
  /** marginDelta over the selling price, in percent. */
  marginPct: string;
  /** The merchandiser's tag, when the pairing carries one. */
  promotionTag: string | null;
}
