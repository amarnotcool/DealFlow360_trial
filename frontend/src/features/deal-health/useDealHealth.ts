// Loading and mutating the alert board in one place, so the screen holds the
// layout and this holds the data.

import { useCallback, useEffect, useState } from 'react';
import type { AlertListMeta, AlertType, AlertView, ApiError } from '@dealflow360/shared';

import { acknowledgeAlert, escalateAlert, fetchAlerts, scanAlerts } from './deal-health.api';

const EMPTY_META: AlertListMeta = {
  total: 0,
  byType: { STALLED_DEAL: 0, DISCOUNT_ANOMALY: 0, DELIVERY_SLIPPAGE: 0 },
  byStatus: { OPEN: 0, ACKNOWLEDGED: 0, ESCALATED: 0, RESOLVED: 0 },
};

export interface DealHealthState {
  /** Null while the first load is in flight. */
  alerts: AlertView[] | null;
  meta: AlertListMeta;
  error: ApiError | null;
  busy: boolean;
  /** What the last scan found, until the next action clears it. */
  notice: string | null;
  type: AlertType | null;
  setType: (next: AlertType | null) => void;
  scan: () => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
  escalate: (id: string) => Promise<void>;
}

export function useDealHealth(): DealHealthState {
  const [alerts, setAlerts] = useState<AlertView[] | null>(null);
  const [meta, setMeta] = useState<AlertListMeta>(EMPTY_META);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [type, setType] = useState<AlertType | null>(null);

  const load = useCallback(async () => {
    const response = await fetchAlerts(type ? { type } : {});
    setAlerts(response.data ?? []);
    setMeta(response.meta ?? EMPTY_META);
    setError(response.error);
  }, [type]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs one action, then re-reads the board from the API. */
  const run = useCallback(
    async (action: () => Promise<{ error: ApiError | null }>, done: string | null) => {
      setBusy(true);
      setError(null);
      const response = await action();
      setBusy(false);

      if (response.error) {
        setError(response.error);
        return;
      }

      setNotice(done);
      await load();
    },
    [load],
  );

  const scan = useCallback(async () => {
    setBusy(true);
    setError(null);
    const response = await scanAlerts();
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    const { created, existing } = response.data;
    setNotice(
      created === 0
        ? existing === 0
          ? 'Scan complete — nothing is stalled, over-discounted or late.'
          : `Scan complete — no new alerts; the ${existing} already on the board still stand.`
        : `Scan opened ${created} new alert${created === 1 ? '' : 's'}${
            existing > 0 ? `, alongside ${existing} already on the board` : ''
          }.`,
    );
    await load();
  }, [load]);

  const acknowledge = useCallback(
    (id: string) => run(() => acknowledgeAlert(id), 'Alert acknowledged.'),
    [run],
  );

  const escalate = useCallback(
    (id: string) =>
      run(() => escalateAlert(id), 'Escalated to the rep — the note is on the audit trail.'),
    [run],
  );

  return { alerts, meta, error, busy, notice, type, setType, scan, acknowledge, escalate };
}
