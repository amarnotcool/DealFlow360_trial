// XLSX rendering for screen 15's "Export XLSX".
//
// Same input, same words as the PDF: the filter lines, the metric groups and
// the quotations columns are shared with reporting.pdf.ts, so the two files
// can never disagree. Values stay formatted strings, exactly as in the PDF —
// a spreadsheet that matches the printed report beats clever numeric cells.

import * as XLSX from 'xlsx';
import type { ReportQuotationRow, ReportSummary } from '@dealflow360/shared';

import { COLUMNS, cellValue, filterLines, metricGroups } from './reporting.pdf';

export interface ReportXlsxInput {
  summary: ReportSummary;
  rows: ReportQuotationRow[];
  /** How many rows matched, which may exceed the number printed. */
  totalRows: number;
  rowLimit: number;
}

export function renderReportXlsx(input: ReportXlsxInput): Buffer {
  const { summary, rows, totalRows, rowLimit } = input;

  const cover: string[][] = [
    ['DealFlow360 — Sales Report'],
    [`Generated ${summary.generatedAt.replace('T', ' ').slice(0, 19)} UTC`],
    [],
    ['Applied filters'],
    ...filterLines(summary).map((line) => [line]),
    [],
    ['Summary metrics'],
  ];
  for (const group of metricGroups(summary)) {
    cover.push([group.heading]);
    for (const [label, value] of group.pairs) cover.push([label, value]);
    cover.push([]);
  }
  const summarySheet = XLSX.utils.aoa_to_sheet(cover);

  const table: string[][] = [COLUMNS.map((column) => column.label)];
  if (rows.length === 0) {
    table.push(['No quotations match these filters.']);
  }
  for (const row of rows) {
    table.push(COLUMNS.map((column) => cellValue(row, column.key as string)));
  }
  if (totalRows > rows.length) {
    table.push([]);
    table.push([
      `Showing the first ${rowLimit} of ${totalRows} matching quotations. Narrow the filters to export the rest.`,
    ]);
  }
  const quotationsSheet = XLSX.utils.aoa_to_sheet(table);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(workbook, quotationsSheet, 'Quotations');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
