import type {
  DiscountReport,
  ProductListItem,
  QuotationStatus,
  ReportOwnerOption,
  ReportQuotationRow,
  ReportQuotationsMeta,
  ReportSummary,
} from '@dealflow360/shared';

import { apiDownload, apiGet, apiList } from '../../lib/api-client';

/**
 * The four filters specs screen 15 names. All optional, all combinable, and the
 * same query string is handed to every endpoint — including the export, so the
 * PDF is always the report currently on screen.
 */
export interface ReportFilterState {
  from: string;
  to: string;
  approvalStatus: QuotationStatus | '';
  productId: string;
  ownerId: string;
}

export const EMPTY_FILTERS: ReportFilterState = {
  from: '',
  to: '',
  approvalStatus: '',
  productId: '',
  ownerId: '',
};

export function toQueryString(filters: ReportFilterState, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.approvalStatus) params.set('approvalStatus', filters.approvalStatus);
  if (filters.productId) params.set('productId', filters.productId);
  if (filters.ownerId) params.set('ownerId', filters.ownerId);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/** True when the report is showing everything, which changes the empty state. */
export function hasAnyFilter(filters: ReportFilterState): boolean {
  return Object.values(filters).some((value) => value !== '');
}

export function fetchSummary(filters: ReportFilterState) {
  return apiGet<ReportSummary>(`/reports/summary${toQueryString(filters)}`);
}

export function fetchDiscountReport(filters: ReportFilterState) {
  return apiGet<DiscountReport>(`/reports/discounts${toQueryString(filters)}`);
}

/** The breakdown table. Capped: this is a report screen, not an export. */
export const BREAKDOWN_PAGE_SIZE = 100;

export function fetchReportQuotations(filters: ReportFilterState) {
  return apiList<ReportQuotationRow, ReportQuotationsMeta>(
    `/reports/quotations${toQueryString(filters, { take: String(BREAKDOWN_PAGE_SIZE) })}`,
  );
}

/** The "Sales Team" filter's options — reps who own quotations, not the
 *  staff directory, which is admin-only. */
export function fetchReportOwners() {
  return apiList<ReportOwnerOption, { total: number }>('/reports/owners');
}

/** The Product filter's options. The catalogue is readable by everyone. */
export function fetchFilterProducts() {
  return apiList<ProductListItem>('/products');
}

export function downloadReportPdf(filters: ReportFilterState) {
  return apiDownload(
    `/reports/export${toQueryString(filters, { format: 'pdf' })}`,
    'dealflow360-report.pdf',
  );
}
