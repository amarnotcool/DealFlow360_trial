import type {
  AlertListMeta,
  AlertScanResult,
  AlertStatus,
  AlertType,
  AlertView,
} from '@dealflow360/shared';

import { apiList, apiPost } from '../../lib/api-client';

export interface AlertQuery {
  /** Omitted, the API answers with everything still live. */
  status?: AlertStatus;
  type?: AlertType;
  assignedUserId?: string;
}

function toQueryString(query: AlertQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.type) params.set('type', query.type);
  if (query.assignedUserId) params.set('assignedUserId', query.assignedUserId);

  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export function fetchAlerts(query: AlertQuery = {}) {
  return apiList<AlertView, AlertListMeta>(`/alerts${toQueryString(query)}`);
}

/**
 * Runs the three detectors. They have no timer behind them, so this button is
 * what makes them run; the call is idempotent, so pressing it twice opens
 * nothing twice.
 */
export function scanAlerts() {
  return apiPost<AlertScanResult>('/alerts/scan', {});
}

export function acknowledgeAlert(id: string) {
  return apiPost<AlertView>(`/alerts/${id}/acknowledge`, {});
}

/** Nudge and escalate are the same act on the record, audited with the note. */
export function escalateAlert(id: string, note?: string | null) {
  return apiPost<AlertView>(`/alerts/${id}/escalate`, { note: note ?? null });
}
