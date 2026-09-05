// HTTP layer only: read the parsed query, call the service, shape the response.

import type { Request, Response } from 'express';

import * as reportingService from './reporting.service';
import type {
  ReportExportQuery,
  ReportFiltersQuery,
  ReportQuotationsQuery,
} from './reporting.schemas';

export async function summary(req: Request, res: Response): Promise<void> {
  const filters = req.query as unknown as ReportFiltersQuery;
  const data = await reportingService.getSummary(filters);

  res.json({ data, error: null });
}

export async function quotations(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ReportQuotationsQuery;
  const { rows, meta } = await reportingService.listReportQuotations(query);

  res.json({ data: rows, error: null, meta });
}

export async function discounts(req: Request, res: Response): Promise<void> {
  const filters = req.query as unknown as ReportFiltersQuery;
  const data = await reportingService.getDiscountReport(filters);

  res.json({ data, error: null });
}

/** The "Sales Team" filter's options. */
export async function owners(_req: Request, res: Response): Promise<void> {
  const data = await reportingService.listReportOwners();

  res.json({ data, error: null, meta: { total: data.length } });
}

/**
 * The one endpoint that does not answer in the `{ data, error }` envelope: it
 * answers with a file. The service builds the bytes; this only names them.
 */
export async function exportReport(req: Request, res: Response): Promise<void> {
  const filters = req.query as unknown as ReportExportQuery;
  const { buffer, filename, contentType } = await reportingService.exportReport(filters);

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}
