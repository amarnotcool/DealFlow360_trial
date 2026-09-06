import type { DiscountConfigView, DiscountRuleView } from '@dealflow360/shared';

import { apiGet, apiPatch } from '../../lib/api-client';

/** The ceilings the engine applies, plus the routing it applies them through. */
export function fetchDiscountConfig() {
  return apiGet<DiscountConfigView>('/discount-rules');
}

export function updateCeiling(ruleId: string, ceilingPct: number, reason: string | null) {
  return apiPatch<DiscountRuleView>(`/discount-rules/${ruleId}`, { ceilingPct, reason });
}
