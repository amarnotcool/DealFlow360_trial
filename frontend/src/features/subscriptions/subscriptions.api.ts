import type {
  InvoiceDetailView,
  SubscriptionDetailView,
  SubscriptionListItem,
  SubscriptionListMeta,
  SubscriptionPlanView,
} from '@dealflow360/shared';

import { apiGet, apiList, apiPost } from '../../lib/api-client';

export function fetchSubscriptions(status?: string) {
  const query = status ? `?status=${status}` : '';
  return apiList<SubscriptionListItem, SubscriptionListMeta>(`/subscriptions${query}`);
}

export function fetchSubscription(id: string) {
  return apiGet<SubscriptionDetailView>(`/subscriptions/${id}`);
}

/** The plans the change form offers, cheapest first. */
export function fetchSubscriptionPlans() {
  return apiList<SubscriptionPlanView>('/subscription-plans');
}

export function changeSubscription(
  id: string,
  body: { subscriptionPlanId?: string | null; quantity?: number | null },
) {
  return apiPost<SubscriptionDetailView>(`/subscriptions/${id}/change`, body);
}

export function cancelSubscription(id: string, body: { reason?: string | null }) {
  return apiPost<SubscriptionDetailView>(`/subscriptions/${id}/cancel`, body);
}

/** The demo trigger: bills the open period instead of waiting for a cycle. */
export function generateSubscriptionInvoice(id: string) {
  return apiPost<InvoiceDetailView>(`/subscriptions/${id}/generate-invoice`, {});
}
