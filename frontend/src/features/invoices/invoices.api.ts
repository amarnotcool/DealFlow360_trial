import type {
  InvoiceDetailView,
  InvoiceListItem,
  InvoiceListMeta,
  OrderBillingView,
  PaymentMethodValue,
} from '@dealflow360/shared';

import { apiGet, apiList, apiPost } from '../../lib/api-client';

export function fetchInvoices(type?: string) {
  const query = type ? `?type=${type}` : '';
  return apiList<InvoiceListItem, InvoiceListMeta>(`/invoices${query}`);
}

export function fetchInvoice(id: string) {
  return apiGet<InvoiceDetailView>(`/invoices/${id}`);
}

export function recordPayment(
  id: string,
  body: { actorUserId: string; amount: number; method: PaymentMethodValue; reference?: string | null },
) {
  return apiPost<InvoiceDetailView>(`/invoices/${id}/pay`, body);
}

/** Screen 10, merged into subscription detail: one order, both billing streams. */
export function fetchOrderBilling(salesOrderId: string) {
  return apiGet<OrderBillingView>(`/orders/${salesOrderId}/billing`);
}
