import type {
  QuotationDetailView,
  QuotationListItem,
  QuotationStatus,
  SalesOrderConfirmationView,
} from '@dealflow360/shared';

import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '../../lib/api-client';

export function fetchQuotations(status?: QuotationStatus) {
  const query = status ? `?status=${status}` : '';
  return apiList<QuotationListItem>(`/quotations${query}`);
}

export function fetchQuotation(id: string) {
  return apiGet<QuotationDetailView>(`/quotations/${id}`);
}

export function createQuotation(body: { customerId: string; lines: [] }) {
  return apiPost<QuotationDetailView>('/quotations', body);
}

export function addQuotationLine(
  quotationId: string,
  body: {
    productId: string;
    /** Null when the product is sold as one configuration. */
    productVariantId?: string | null;
    quantity: number;
    discountPct: number;
  },
) {
  return apiPost<QuotationDetailView>(`/quotations/${quotationId}/lines`, body);
}

export function updateQuotationLine(
  quotationId: string,
  lineId: string,
  body: { discountPct?: number; quantity?: number },
) {
  return apiPatch<QuotationDetailView>(`/quotations/${quotationId}/lines/${lineId}`, body);
}

export function deleteQuotationLine(quotationId: string, lineId: string) {
  return apiDelete<QuotationDetailView>(`/quotations/${quotationId}/lines/${lineId}`, {});
}

export function submitQuotation(quotationId: string) {
  return apiPost<QuotationDetailView>(`/quotations/${quotationId}/submit`, {});
}

export function confirmQuotation(quotationId: string) {
  return apiPost<SalesOrderConfirmationView>(`/quotations/${quotationId}/confirm`, {});
}
