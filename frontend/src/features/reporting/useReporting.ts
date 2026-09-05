// The reporting screen's data in one place: the filters, the three reports
// they drive, and the export that ships whatever is currently on screen.
//
// The three reports are read together on every filter change — they are three
// views of one filtered set, so showing them out of step with each other would
// be worse than a moment's wait.

import { useCallback, useEffect, useState } from 'react';
import type {
  ApiError,
  DiscountReport,
  ProductListItem,
  ReportOwnerOption,
  ReportQuotationRow,
  ReportQuotationsMeta,
  ReportSummary,
} from '@dealflow360/shared';

import {
  EMPTY_FILTERS,
  downloadReportPdf,
  downloadReportXlsx,
  fetchDiscountReport,
  fetchFilterProducts,
  fetchReportOwners,
  fetchReportQuotations,
  fetchSummary,
  hasAnyFilter,
} from './reporting.api';
import type { ReportFilterState } from './reporting.api';

export interface ReportingState {
  filters: ReportFilterState;
  setFilter: <K extends keyof ReportFilterState>(key: K, value: ReportFilterState[K]) => void;
  clearFilters: () => void;
  filtered: boolean;

  /** Null until the first load lands, which is what drives the loading card. */
  summary: ReportSummary | null;
  discounts: DiscountReport | null;
  rows: ReportQuotationRow[] | null;
  rowsMeta: ReportQuotationsMeta | null;

  /** The filter dropdowns' options. */
  owners: ReportOwnerOption[];
  products: ProductListItem[];

  error: ApiError | null;
  /** True while a filter change is being re-read, with stale data still shown. */
  refreshing: boolean;
  exporting: boolean;
  notice: string | null;
  exportPdf: () => Promise<void>;
  exportXlsx: () => Promise<void>;
}

/** Hands the browser a blob to save under the name the API chose. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: revoking synchronously can beat the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function useReporting(): ReportingState {
  const [filters, setFilters] = useState<ReportFilterState>(EMPTY_FILTERS);

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [discounts, setDiscounts] = useState<DiscountReport | null>(null);
  const [rows, setRows] = useState<ReportQuotationRow[] | null>(null);
  const [rowsMeta, setRowsMeta] = useState<ReportQuotationsMeta | null>(null);

  const [owners, setOwners] = useState<ReportOwnerOption[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);

  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The filter options never change with the filters, so they load once.
  useEffect(() => {
    void (async () => {
      const [ownerResponse, productResponse] = await Promise.all([
        fetchReportOwners(),
        fetchFilterProducts(),
      ]);
      setOwners(ownerResponse.data ?? []);
      setProducts(productResponse.data ?? []);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);

    void (async () => {
      const [summaryResponse, discountResponse, rowsResponse] = await Promise.all([
        fetchSummary(filters),
        fetchDiscountReport(filters),
        fetchReportQuotations(filters),
      ]);

      // A filter changed again while this was in flight: its own run will land.
      if (cancelled) return;

      setSummary(summaryResponse.data);
      setDiscounts(discountResponse.data);
      setRows(rowsResponse.data ?? []);
      setRowsMeta(rowsResponse.meta ?? null);
      setError(summaryResponse.error ?? discountResponse.error ?? rowsResponse.error);
      setRefreshing(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [filters]);

  const setFilter = useCallback(
    <K extends keyof ReportFilterState>(key: K, value: ReportFilterState[K]) => {
      setNotice(null);
      setFilters((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setNotice(null);
    setFilters(EMPTY_FILTERS);
  }, []);

  const exportPdf = useCallback(async () => {
    setExporting(true);
    setError(null);
    const result = await downloadReportPdf(filters);
    setExporting(false);

    if (!result.blob) {
      setError(result.error);
      return;
    }

    saveBlob(result.blob, result.filename);
    setNotice(`Exported ${result.filename} with the filters currently applied.`);
  }, [filters]);

  const exportXlsx = useCallback(async () => {
    setExporting(true);
    setError(null);
    const result = await downloadReportXlsx(filters);
    setExporting(false);

    if (!result.blob) {
      setError(result.error);
      return;
    }

    saveBlob(result.blob, result.filename);
    setNotice(`Exported ${result.filename} with the filters currently applied.`);
  }, [filters]);

  return {
    filters,
    setFilter,
    clearFilters,
    filtered: hasAnyFilter(filters),
    summary,
    discounts,
    rows,
    rowsMeta,
    owners,
    products,
    error,
    refreshing,
    exporting,
    notice,
    exportPdf,
    exportXlsx,
  };
}
