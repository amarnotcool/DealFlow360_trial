// The customer's landing screen: where their quotations stand, at a glance.
//
// Everything here is derived from GET /portal/quotations, the one read a portal
// session is allowed. The portal has no orders or invoices endpoint, so this
// screen shows neither — a card the API cannot fill has no business being on it.
//
// Scope is the API's, not this screen's: the list arrives already filtered to
// the customer on the portal session, and to the stages a customer is meant to
// see. Nothing is filtered here.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiError, PortalQuotationListItem } from '@dealflow360/shared';

import { PortalLayout } from '../../components/layout/PortalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  CardMetric,
  EmptyCard,
  ErrorCard,
  LoadingCard,
} from '../../components/ui';
import { usePortalAuth } from '../../features/auth/usePortalAuth';
import { fetchPortalQuotations } from '../../features/portal/portal.api';
import { date, money } from '../../lib/format';
import { portalStatus } from './portal-status';

/** The stages that are waiting on the customer rather than on us. */
const AWAITING_YOU = ['APPROVED', 'NEGOTIATION'];

const RECENT_COUNT = 4;

export default function Overview() {
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

  const summary = useMemo(() => {
    const list = rows ?? [];
    return {
      awaiting: list.filter((row) => AWAITING_YOU.includes(row.status)),
      withUs: list.filter((row) => row.status === 'PENDING_APPROVAL').length,
      confirmed: list.filter((row) => row.status === 'CONFIRMED').length,
      openValue: list
        .filter((row) => AWAITING_YOU.includes(row.status))
        .reduce((sum, row) => sum + Number(row.totalAmount), 0),
      requests: list.reduce((sum, row) => sum + row._count.negotiationRequests, 0),
    };
  }, [rows]);

  // Newest first, as the API already orders them.
  const recent = (rows ?? []).slice(0, RECENT_COUNT);

  return (
    <PortalLayout
      title={contact ? `Hello, ${contact.fullName.split(' ')[0]}` : 'Welcome'}
      subtitle={
        contact
          ? `Everything we are working on with ${contact.customerName}.`
          : 'Everything we are working on with you.'
      }
      actions={
        contact && (
          <div className="flex flex-wrap items-center gap-sm">
            <Badge variant="dark">{contact.customerName}</Badge>
            <Badge variant="primary">{contact.customerTier.name} account</Badge>
          </div>
        )
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      {rows === null ? (
        <LoadingCard label="Your quotations" />
      ) : rows.length === 0 ? (
        <EmptyCard message="Nothing to review yet — when your account manager shares a quotation, it appears here." />
      ) : (
        <>
          <div className="mb-lg grid gap-gutter md:grid-cols-3">
            <Card tone={summary.awaiting.length > 0 ? 'lemon' : 'obsidian'}>
              <CardLabel>Waiting on you</CardLabel>
              <CardMetric>{summary.awaiting.length}</CardMetric>
              <p className="text-body-sm opacity-80">
                {summary.awaiting.length > 0
                  ? `${money(String(summary.openValue))} across quotations you can review or confirm`
                  : 'nothing needs your decision right now'}
              </p>
            </Card>

            <Card>
              <CardLabel>With our team</CardLabel>
              <CardMetric>{summary.withUs}</CardMetric>
              <p className="text-body-sm text-ink-subtle">
                {summary.withUs > 0
                  ? 'being reviewed after your requested changes'
                  : 'nothing is with us for review'}
              </p>
            </Card>

            <Card>
              <CardLabel>Confirmed</CardLabel>
              <CardMetric>{summary.confirmed}</CardMetric>
              <p className="text-body-sm text-ink-subtle">
                {summary.requests > 0
                  ? `${summary.requests} change request${summary.requests === 1 ? '' : 's'} sent so far`
                  : 'no change requests sent yet'}
              </p>
            </Card>
          </div>

          <div className="mb-md flex flex-wrap items-end justify-between gap-sm">
            <div>
              <h2 className="text-title-md text-ink">Recent quotations</h2>
              <p className="text-body-sm text-ink-subtle">
                {rows.length > RECENT_COUNT
                  ? `The ${RECENT_COUNT} most recent of ${rows.length}. Open one to comment, ask for a change, or confirm.`
                  : 'Open one to comment, ask for a change, or confirm.'}
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate('/portal/quotations')}>
              See all quotations
            </Button>
          </div>

          <div className="grid gap-gutter md:grid-cols-2">
            {recent.map((row) => {
              const status = portalStatus(row.status);

              return (
                <Card
                  key={row.id}
                  className="flex cursor-pointer flex-col gap-sm transition-all duration-150 hover:-translate-y-px"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/portal/quotations/${row.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/portal/quotations/${row.id}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-sm">
                    <div>
                      <CardLabel>{row.number}</CardLabel>
                      <p className="tabular mt-2xs text-headline-lg text-ink">
                        {money(row.totalAmount)}
                      </p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>

                  <p className="text-body-sm text-ink-subtle">{status.detail}</p>

                  <dl className="tabular grid grid-cols-3 gap-xs text-body-sm text-ink-body">
                    <div>
                      <dt className="text-label-md text-ink-subtle">Items</dt>
                      <dd>{row._count.lines}</dd>
                    </div>
                    <div>
                      <dt className="text-label-md text-ink-subtle">Your requests</dt>
                      <dd>{row._count.negotiationRequests}</dd>
                    </div>
                    <div>
                      <dt className="text-label-md text-ink-subtle">Valid until</dt>
                      <dd>{date(row.validUntil)}</dd>
                    </div>
                  </dl>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </PortalLayout>
  );
}
