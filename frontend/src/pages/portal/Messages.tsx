// Every request this customer has sent, across all of their quotations, with
// whatever came back. There is no separate messages endpoint: the portal's
// conversation *is* the negotiation history, so this reads the same quotations
// the customer can already open.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, PortalNegotiationView } from '@dealflow360/shared';

import { PortalLayout } from '../../components/layout/PortalLayout';
import { Badge, Card, CardLabel, EmptyCard, ErrorCard, LoadingCard } from '../../components/ui';
import { fetchPortalQuotation, fetchPortalQuotations } from '../../features/portal/portal.api';
import { date } from '../../lib/format';
import { requestState } from './request-status';

interface Thread {
  quotationId: string;
  number: string;
  status: string;
  requests: Array<PortalNegotiationView & { lineName: string }>;
}

export default function Messages() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    const list = await fetchPortalQuotations();

    if (!list.data) {
      setThreads([]);
      setError(list.error);
      return;
    }

    // Only quotations that carry requests are worth opening; the count comes
    // back on the list, so nothing is fetched for a quiet quotation.
    const withRequests = list.data.filter((row) => row._count.negotiationRequests > 0);
    const details = await Promise.all(withRequests.map((row) => fetchPortalQuotation(row.id)));

    setThreads(
      details
        .map((response) => response.data)
        .filter((detail): detail is NonNullable<typeof detail> => detail !== null)
        .map((detail) => ({
          quotationId: detail.id,
          number: detail.number,
          status: detail.status,
          requests: detail.negotiationRequests.map((request) => ({
            ...request,
            lineName:
              detail.lines.find((line) => line.id === request.quotationLineId)?.product.name ??
              'Whole quotation',
          })),
        })),
    );
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalLayout title="Messages" subtitle="Everything you have asked us for, and what came back">
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      {threads === null ? (
        <LoadingCard label="Messages" />
      ) : threads.length === 0 ? (
        <EmptyCard message="No messages yet — ask for a change on a quotation and it will appear here." />
      ) : (
        <div className="flex flex-col gap-gutter">
          {threads.map((thread) => (
            <Card key={thread.quotationId}>
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <CardLabel>Quotation {thread.number}</CardLabel>
                <button
                  type="button"
                  onClick={() => navigate(`/portal/quotations/${thread.quotationId}`)}
                  className="rounded-full bg-white/85 px-md py-[0.35rem] text-body-sm text-ink
                    shadow-floating transition-all duration-150 hover:-translate-y-px hover:bg-white"
                >
                  Open quotation
                </button>
              </div>

              <ul className="mt-md flex flex-col gap-sm">
                {thread.requests.map((request) => {
                  const state = requestState(request.status);

                  return (
                    <li key={request.id} className="flex flex-wrap items-center gap-sm">
                      <Badge variant={state.variant}>{state.label}</Badge>
                      <span className="text-title-sm text-ink">{request.lineName}</span>
                      {request.counterDiscountPct && (
                        <span className="tabular text-body-md text-ink-body">
                          asked for {Number(request.counterDiscountPct)}%
                        </span>
                      )}
                      {request.requestedDeliveryDate && (
                        <span className="text-body-sm text-ink-body">
                          delivery by {date(request.requestedDeliveryDate)}
                        </span>
                      )}
                      {request.comment && (
                        <span className="text-body-sm text-ink-body">“{request.comment}”</span>
                      )}
                      <span className="text-body-sm text-ink-subtle">{date(request.createdAt)}</span>
                      {request.responseNote && (
                        <span className="text-body-sm text-ink">Reply: {request.responseNote}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </PortalLayout>
  );
}
