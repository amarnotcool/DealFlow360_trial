// Screen 11, first stop: the quotations shared with this customer.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, PortalQuotationListItem } from '@dealflow360/shared';

import { PortalLayout } from '../../components/layout/PortalLayout';
import { Badge, Card, CardLabel, EmptyCard, ErrorCard, LoadingCard } from '../../components/ui';
import { usePortalAuth } from '../../features/auth/usePortalAuth';
import { fetchPortalQuotations } from '../../features/portal/portal.api';
import { date, money } from '../../lib/format';
import { portalStatus } from './portal-status';

export default function MyQuotations() {
  const navigate = useNavigate();
  const { contact } = usePortalAuth();
  const [rows, setRows] = useState<PortalQuotationListItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    const response = await fetchPortalQuotations();
    setRows(response.data ?? []);
    setError(response.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalLayout
      title="My quotations"
      subtitle={contact ? `Quotations shared with ${contact.customerName}` : 'Your quotations'}
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      {rows === null ? (
        <LoadingCard label="Quotations" />
      ) : rows.length === 0 ? (
        <EmptyCard message="No quotations available yet — your account manager will share one here." />
      ) : (
        <div className="grid gap-gutter md:grid-cols-2">
          {rows.map((row) => {
            const status = portalStatus(row.status);

            return (
              <Card key={row.id} className="flex flex-col gap-sm">
                <div className="flex items-start justify-between gap-sm">
                  <div>
                    <CardLabel>{row.number}</CardLabel>
                    <p className="tabular mt-2xs text-headline-lg text-ink">{money(row.totalAmount)}</p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                <p className="text-body-sm text-ink-subtle">{status.detail}</p>

                <dl className="tabular grid grid-cols-2 gap-xs text-body-sm text-ink-body">
                  <div>
                    <dt className="text-label-md text-ink-subtle">Items</dt>
                    <dd>{row._count.lines}</dd>
                  </div>
                  <div>
                    <dt className="text-label-md text-ink-subtle">Your requests</dt>
                    <dd>{row._count.negotiationRequests}</dd>
                  </div>
                  {Number(row.recurringTotalAmount) > 0 && (
                    <div>
                      <dt className="text-label-md text-ink-subtle">Recurring</dt>
                      <dd>{money(row.recurringTotalAmount)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-label-md text-ink-subtle">Shared on</dt>
                    <dd>{date(row.createdAt)}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={() => navigate(`/portal/quotations/${row.id}`)}
                  className="mt-2xs self-start rounded-full bg-obsidian px-md py-[0.45rem] text-title-sm
                    text-white shadow-depth-obsidian transition-all duration-150 hover:-translate-y-px"
                >
                  Open quotation
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </PortalLayout>
  );
}
