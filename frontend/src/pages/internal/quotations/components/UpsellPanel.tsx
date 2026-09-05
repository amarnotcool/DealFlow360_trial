// Screen 4's upsell panel (specs.md §4): ranked suggestions with margin delta.
//
// Accepting adds the line at list through the normal add-line endpoint, with
// the pairing id stored as the line's source — the server recomputes total,
// margin and risk and sends the quote back, so the update is immediate.

import { useEffect, useState } from 'react';
import type { ApiError, QuotationDetailView, RecommendationView } from '@dealflow360/shared';

import {
  Badge,
  Button,
  Card,
  CardLabel,
  EmptyCard,
  ErrorCard,
} from '../../../../components/ui';
import {
  addQuotationLine,
  fetchRecommendations,
} from '../../../../features/quotations/quotations.api';
import { money, percent } from '../../../../lib/format';

interface UpsellPanelProps {
  quotationId: string;
  /** The panel refetches whenever this changes — the parent passes a key of
   *  the current lines, so an accepted suggestion disappears at once. */
  linesKey: string;
  onAccepted: (quotation: QuotationDetailView) => void;
}

export default function UpsellPanel({ quotationId, linesKey, onAccepted }: UpsellPanelProps) {
  const [suggestions, setSuggestions] = useState<RecommendationView[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSuggestions(null);
    setError(null);

    void fetchRecommendations(quotationId).then((response) => {
      if (cancelled) return;
      setSuggestions(response.data ?? []);
      setError(response.error);
    });

    return () => {
      cancelled = true;
    };
  }, [quotationId, linesKey]);

  async function handleAdd(suggestion: RecommendationView) {
    setAddingId(suggestion.product.id);
    const response = await addQuotationLine(quotationId, {
      productId: suggestion.product.id,
      quantity: suggestion.suggestedQuantity,
      discountPct: 0,
      sourceRecommendationId: suggestion.recommendationId,
    });
    setAddingId(null);

    if (response.data) {
      onAccepted(response.data);
      return;
    }
    setError(response.error);
  }

  return (
    <Card className="mt-lg">
      <CardLabel>Suggested for this quote</CardLabel>
      <p className="mt-xs text-body-sm text-ink-subtle">
        Healthy-margin picks, ranked by the margin they add. Accepting adds the line at list —
        total and margin update immediately.
      </p>

      {error && (
        <div className="mt-md">
          <ErrorCard error={error} />
        </div>
      )}

      {suggestions === null ? (
        <p className="mt-md text-body-sm text-ink-subtle">Finding suggestions…</p>
      ) : suggestions.length === 0 ? (
        <div className="mt-md">
          <EmptyCard message="No suggestions right now — every healthy-margin product is already on this quote." />
        </div>
      ) : (
        <ul className="mt-md flex flex-col gap-sm">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.product.id}
              className="flex flex-wrap items-center justify-between gap-md rounded-vessel border border-white/70 bg-white/50 px-lg py-md"
            >
              <div className="min-w-0">
                <p className="text-title-sm text-ink">{suggestion.product.name}</p>
                <p className="mt-2xs text-label-md text-ink-subtle">
                  {suggestion.product.sku} · {suggestion.product.category.name} ·{' '}
                  {money(suggestion.listPrice)} at list
                </p>
                <div className="mt-xs flex flex-wrap items-center gap-xs">
                  <Badge variant="primary" className="tabular">+{money(suggestion.marginDelta)} margin</Badge>
                  <Badge variant="neutral" className="tabular">{percent(suggestion.marginPct)} margin</Badge>
                  {suggestion.promotionTag && (
                    <Badge variant="info">{suggestion.promotionTag}</Badge>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                disabled={addingId !== null}
                onClick={() => void handleAdd(suggestion)}
              >
                {addingId === suggestion.product.id ? 'Adding…' : 'Add'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
