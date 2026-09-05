// PDF rendering for screen 15's "Export PDF".
//
// Formatting only: this file takes the plain objects the reporting service
// already built and lays them out. It reads no database and knows no business
// rules, so what the PDF says can never drift from what the JSON endpoints say.
//
// The layout is deliberately plain — a title, the filters the report was built
// from, the summary metrics, then the quotations table. A report that prints
// cleanly in black and white is worth more than a styled one.

import PDFDocument from 'pdfkit';
import type { ReportQuotationRow, ReportSummary } from '@dealflow360/shared';

export interface ReportPdfInput {
  summary: ReportSummary;
  rows: ReportQuotationRow[];
  /** How many rows matched, which may exceed the number printed. */
  totalRows: number;
  rowLimit: number;
}

const PAGE_MARGIN = 48;
/** One table row is one line of 8pt text plus a little air. */
const ROW_HEIGHT = 12;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

const INK = '#111111';
const MUTED = '#666666';
const RULE = '#CCCCCC';

/** Column widths for the quotations table, summing to the content width. */
const COLUMNS: { key: keyof ReportQuotationRow | 'customerName' | 'ownerName'; label: string; width: number; align: 'left' | 'right' }[] = [
  { key: 'number', label: 'Quotation', width: 78, align: 'left' },
  { key: 'customerName', label: 'Customer', width: 104, align: 'left' },
  { key: 'ownerName', label: 'Owner', width: 92, align: 'left' },
  { key: 'status', label: 'Status', width: 80, align: 'left' },
  { key: 'totalAmount', label: 'Total', width: 74, align: 'right' },
  { key: 'discountPct', label: 'Disc %', width: 44, align: 'right' },
  { key: 'riskScore', label: 'Risk', width: 36, align: 'right' },
  { key: 'createdAt', label: 'Date', width: 60, align: 'left' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

/** Thousands separators only; the value is already at Decimal(14,2) scale. */
function formatMoney(value: string): string {
  const [whole, fraction = '00'] = value.split('.');
  const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${fraction}`;
}

function cellValue(row: ReportQuotationRow, key: string): string {
  switch (key) {
    case 'customerName':
      return row.customer.tierCode ? `${row.customer.name} (${row.customer.tierCode})` : row.customer.name;
    case 'ownerName':
      return row.owner.fullName;
    case 'status':
      return row.status.replace(/_/g, ' ');
    case 'totalAmount':
      return formatMoney(row.totalAmount);
    case 'createdAt':
      return formatDate(row.createdAt);
    default:
      return String((row as unknown as Record<string, unknown>)[key] ?? '');
  }
}

/** The filter lines, in the order specs screen 15 lists the filters. */
function filterLines(summary: ReportSummary): string[] {
  const { filters } = summary;
  // An open-ended period is named as such rather than printed with a dash on
  // the missing side, which reads as a missing value rather than a choice.
  let period = 'All time';
  if (filters.from && filters.to) period = `${formatDate(filters.from)} to ${formatDate(filters.to)}`;
  else if (filters.from) period = `${formatDate(filters.from)} onwards`;
  else if (filters.to) period = `Up to ${formatDate(filters.to)}`;

  return [
    `Period: ${period}`,
    `Sales rep: ${filters.owner ? filters.owner.fullName : 'All reps'}`,
    `Approval status: ${filters.approvalStatus ? filters.approvalStatus.replace(/_/g, ' ') : 'All statuses'}`,
    `Product: ${filters.product ? `${filters.product.name} (${filters.product.sku})` : 'All products'}`,
  ];
}

/** The summary section, as label/value pairs grouped under headings. */
function metricGroups(summary: ReportSummary): { heading: string; pairs: [string, string][] }[] {
  const { quotations, value, approvals, discounts, billing, subscriptions, backorders } = summary;

  const statusPairs = (Object.entries(quotations.byStatus) as [string, number][])
    .filter(([, count]) => count > 0)
    .map(([status, count]) => [status.replace(/_/g, ' '), String(count)] as [string, string]);

  return [
    {
      heading: 'Quotations',
      pairs: [
        ['Total quotations', String(quotations.total)],
        ['Requiring approval', String(quotations.requiresApproval)],
        ...(statusPairs.length > 0 ? statusPairs : ([['No quotations in scope', '—']] as [string, string][])),
      ],
    },
    {
      heading: 'Value',
      pairs: [
        ['Quotation value', formatMoney(value.quotationTotal)],
        ['One-time', formatMoney(value.oneTimeTotal)],
        ['Recurring', formatMoney(value.recurringTotal)],
        ['Discount given', formatMoney(value.discountTotal)],
        ['Confirmed order value', formatMoney(value.orderTotal)],
        ['Sales orders', String(value.orderCount)],
      ],
    },
    {
      heading: 'Approvals & discounts',
      pairs: [
        ['Approved', String(approvals.approved)],
        ['Rejected', String(approvals.rejected)],
        ['Pending approval', String(approvals.pending)],
        ['Approval rate', approvals.approvalRatePct ? `${approvals.approvalRatePct}%` : 'Nothing decided yet'],
        ['Average discount', `${discounts.averageDiscountPct}%`],
        ['Average blended risk', discounts.averageBlendedRisk],
        ['Lines over ceiling', String(discounts.overLimitLines)],
      ],
    },
    {
      heading: 'Billing, subscriptions & backorders',
      pairs: [
        ['Invoices', String(billing.invoiceCount)],
        ['Invoiced', formatMoney(billing.invoicedAmount)],
        ['Paid', formatMoney(billing.paidAmount)],
        ['Outstanding', formatMoney(billing.outstandingAmount)],
        ['Active subscriptions', String(subscriptions.active)],
        ['Recurring per cycle', formatMoney(subscriptions.activeRecurringAmount)],
        ['Open backorders', String(backorders.open + backorders.partiallyResolved)],
      ],
    },
  ];
}

export function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const { summary, rows, totalRows, rowLimit } = input;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = PAGE_MARGIN;
    const contentWidth = doc.page.width - PAGE_MARGIN * 2;

    // --- Title -------------------------------------------------------------
    doc.font(FONT_BOLD).fontSize(20).fillColor(INK).text('DealFlow360 — Sales Report');
    doc
      .font(FONT)
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Generated ${summary.generatedAt.replace('T', ' ').slice(0, 19)} UTC`);

    doc.moveDown(0.8);
    doc.moveTo(left, doc.y).lineTo(left + contentWidth, doc.y).strokeColor(RULE).stroke();
    doc.moveDown(0.8);

    // --- Applied filters ---------------------------------------------------
    doc.font(FONT_BOLD).fontSize(11).fillColor(INK).text('Applied filters');
    doc.moveDown(0.3);
    doc.font(FONT).fontSize(9).fillColor(INK);
    for (const line of filterLines(summary)) doc.text(line, { indent: 6 });

    doc.moveDown(1);

    // --- Summary metrics, two columns of groups ---------------------------
    doc.font(FONT_BOLD).fontSize(11).fillColor(INK).text('Summary metrics');
    doc.moveDown(0.4);

    const groups = metricGroups(summary);
    const columnWidth = (contentWidth - 24) / 2;
    let columnTop = doc.y;
    let rowBottom = columnTop;

    groups.forEach((group, index) => {
      const isRight = index % 2 === 1;
      const x = left + (isRight ? columnWidth + 24 : 0);

      if (!isRight && index > 0) {
        columnTop = rowBottom + 10;
      }

      doc.y = columnTop;
      doc.font(FONT_BOLD).fontSize(9).fillColor(INK).text(group.heading, x, doc.y, { width: columnWidth });
      doc.moveDown(0.2);

      doc.font(FONT).fontSize(9);
      for (const [label, metricValue] of group.pairs) {
        const y = doc.y;
        doc.fillColor(MUTED).text(label, x, y, { width: columnWidth - 90 });
        doc.fillColor(INK).text(metricValue, x + columnWidth - 90, y, { width: 90, align: 'right' });
      }

      rowBottom = Math.max(rowBottom, doc.y);
    });

    doc.y = rowBottom + 16;

    // --- Quotations breakdown ---------------------------------------------
    doc.font(FONT_BOLD).fontSize(11).fillColor(INK).text('Quotations breakdown', left, doc.y);
    doc.moveDown(0.4);

    const drawHeader = (): void => {
      const y = doc.y;
      doc.font(FONT_BOLD).fontSize(8).fillColor(MUTED);

      let x = left;
      for (const column of COLUMNS) {
        doc.text(column.label, x, y, {
          width: column.width,
          align: column.align,
          height: ROW_HEIGHT,
          lineBreak: false,
        });
        x += column.width;
      }

      doc.y = y + 12;
      doc.moveTo(left, doc.y).lineTo(left + contentWidth, doc.y).strokeColor(RULE).stroke();
      doc.y += 4;
    };

    drawHeader();

    if (rows.length === 0) {
      doc.font(FONT).fontSize(9).fillColor(MUTED).text('No quotations match these filters.', left, doc.y);
    }

    doc.font(FONT).fontSize(8).fillColor(INK);
    for (const row of rows) {
      // Start a fresh page before the row runs off the bottom, and repeat the
      // header there so a table spanning pages stays readable.
      if (doc.y + ROW_HEIGHT > doc.page.height - PAGE_MARGIN) {
        doc.addPage();
        doc.y = PAGE_MARGIN;
        drawHeader();
        doc.font(FONT).fontSize(8).fillColor(INK);
      }

      const y = doc.y;
      let x = left;
      for (const column of COLUMNS) {
        // `height` is what holds a cell to one line: `lineBreak: false` alone
        // still wraps in pdfkit 0.16, which would push the row off the page.
        doc.text(cellValue(row, column.key as string), x, y, {
          width: column.width - 4,
          align: column.align,
          height: ROW_HEIGHT,
          lineBreak: false,
          ellipsis: true,
        });
        x += column.width;
      }
      doc.y = y + ROW_HEIGHT;
    }

    if (totalRows > rows.length) {
      doc.moveDown(0.6);
      doc
        .font(FONT)
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Showing the first ${rowLimit} of ${totalRows} matching quotations. Narrow the filters to export the rest.`,
          left,
          doc.y,
          { width: contentWidth },
        );
    }

    // --- Page numbers ------------------------------------------------------
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      doc.switchToPage(page);

      // The footer sits below the content box on purpose. pdfkit would treat
      // that as an overflow and start another page, so the bottom margin is
      // dropped for the one write and put back afterwards.
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc
        .font(FONT)
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Page ${page - range.start + 1} of ${range.count}`,
          left,
          doc.page.height - PAGE_MARGIN + 8,
          { width: contentWidth, align: 'center' },
        );

      doc.page.margins.bottom = bottomMargin;
    }

    doc.end();
  });
}
