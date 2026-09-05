// Screen 6's audit trail: who did what to this quote, and when.
//
// Staff entries name their user; customer-side entries carry no user_id, so
// the portal contact the entry names is shown with a Customer badge instead.

import { useEffect, useState } from 'react';
import type { ApiError, AuditTrailEntryView } from '@dealflow360/shared';

import { Badge, Card, CardLabel, EmptyCard, ErrorCard } from '../../../../components/ui';
import { fetchAuditTrail } from '../../../../features/quotations/quotations.api';
import { dateTime, humanise } from '../../../../lib/format';

const ACTION_BADGE = {
  CREATE: 'neutral',
  UPDATE: 'neutral',
  DELETE: 'critical',
  APPROVE: 'info',
  REJECT: 'critical',
  RETURN: 'primary',
  DISCOUNT_EDIT: 'critical',
  MANUAL_OVERRIDE: 'primary',
  CONFIRM: 'info',
  CANCEL: 'critical',
} as const;

export default function AuditTrail({ quotationId }: { quotationId: string }) {
  const [entries, setEntries] = useState<AuditTrailEntryView[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchAuditTrail(quotationId).then((response) => {
      if (cancelled) return;
      setEntries(response.data ?? []);
      setError(response.error);
    });

    return () => {
      cancelled = true;
    };
  }, [quotationId]);

  return (
    <Card className="mt-lg">
      <CardLabel>Audit trail</CardLabel>

      {error && (
        <div className="mt-md">
          <ErrorCard error={error} />
        </div>
      )}

      {entries === null ? (
        <p className="mt-md text-body-sm text-ink-subtle">Loading audit trail…</p>
      ) : entries.length === 0 ? (
        <div className="mt-md">
          <EmptyCard message="No audit entries yet — actions on this quote will appear here." />
        </div>
      ) : (
        <ol className="mt-md flex flex-col gap-md">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-md gap-y-xs">
              <Badge variant={ACTION_BADGE[entry.action as keyof typeof ACTION_BADGE] ?? 'neutral'}>
                {humanise(entry.action)}
              </Badge>
              <span className="text-title-sm text-ink">
                {entry.actor?.fullName ?? entry.portalContact?.fullName ?? 'Unknown'}
              </span>
              {entry.actor === null && entry.portalContact !== null && (
                <Badge variant="info">Customer</Badge>
              )}
              <span className="tabular text-body-sm text-ink-subtle">
                {dateTime(entry.createdAt)}
              </span>
              {entry.reason && (
                <span className="w-full text-body-sm text-ink-body">{entry.reason}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
