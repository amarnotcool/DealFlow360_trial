// Screen 11: one quotation as the customer sees it, and the two things they can
// do with it — ask for changes, or confirm it.
//
// Nothing internal is shown here: no ceiling, no risk, no approval chain. When
// confirming sends the quote back for review, the customer is told that in
// their own words, not in the workspace's.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  ApiError,
  PortalConfirmResult,
  PortalNegotiationInput,
  PortalQuotationDetailView,
} from '@dealflow360/shared';

import { PortalLayout } from '../../components/layout/PortalLayout';
import {
  Badge,
  Button,
  Card,
  CardLabel,
  ErrorCard,
  LoadingCard,
  Table,
  TableShell,
  TableToolbar,
  Td,
  Th,
  Tr,
} from '../../components/ui';
import {
  confirmPortalQuotation,
  fetchPortalQuotation,
  sendNegotiation,
} from '../../features/portal/portal.api';
import { date, money } from '../../lib/format';
import { portalStatus } from './portal-status';
import { requestState } from './request-status';

interface LineDraft {
  comment: string;
  counterDiscountPct: string;
}

const emptyDraft: LineDraft = { comment: '', counterDiscountPct: '' };

export default function NegotiationScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [quotation, setQuotation] = useState<PortalQuotationDetailView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [orderComment, setOrderComment] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PortalConfirmResult | null>(null);

  const load = useCallback(async () => {
    const response = await fetchPortalQuotation(id);
    setQuotation(response.data);
    setError(response.error);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function draftFor(lineId: string): LineDraft {
    return drafts[lineId] ?? emptyDraft;
  }

  function updateDraft(lineId: string, patch: Partial<LineDraft>) {
    setDrafts((current) => ({ ...current, [lineId]: { ...draftFor(lineId), ...patch } }));
  }

  /** Turns whatever the customer filled in into the requests the API takes. */
  function collectRequests(): PortalNegotiationInput[] {
    const requests: PortalNegotiationInput[] = [];

    for (const [lineId, draft] of Object.entries(drafts)) {
      const comment = draft.comment.trim();
      const counter = draft.counterDiscountPct.trim();

      if (comment.length === 0 && counter.length === 0) continue;

      requests.push({
        quotationLineId: lineId,
        comment: comment.length > 0 ? comment : null,
        counterDiscountPct: counter.length > 0 ? Number(counter) : null,
      });
    }

    const orderNote = orderComment.trim();
    if (orderNote.length > 0 || deliveryDate.length > 0) {
      requests.push({
        quotationLineId: null,
        comment: orderNote.length > 0 ? orderNote : null,
        requestedDeliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : null,
      });
    }

    return requests;
  }

  async function submitRequest() {
    const requests = collectRequests();

    if (requests.length === 0) {
      setError({
        code: 'VALIDATION_ERROR',
        message: 'Add a comment, a discount you would like, or a delivery date first',
      });
      return;
    }

    const invalid = requests.find(
      (request) =>
        request.counterDiscountPct != null &&
        (!Number.isFinite(request.counterDiscountPct) ||
          request.counterDiscountPct < 0 ||
          request.counterDiscountPct > 100),
    );
    if (invalid) {
      setError({ code: 'VALIDATION_ERROR', message: 'A discount has to be between 0 and 100 percent' });
      return;
    }

    setBusy(true);
    const response = await sendNegotiation(id, requests);
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    setQuotation(response.data);
    setError(null);
    setDrafts({});
    setOrderComment('');
    setDeliveryDate('');
    setNotice(`Request sent — ${requests.length} item(s) are with your account manager.`);
  }

  async function confirmQuotation() {
    setBusy(true);
    const response = await confirmPortalQuotation(id);
    setBusy(false);

    if (!response.data) {
      setError(response.error);
      return;
    }

    setOutcome(response.data);
    setQuotation(response.data.quotation);
    setError(null);
    setNotice(null);
  }

  if (error && !quotation) {
    return (
      <PortalLayout title="Quotation">
        <ErrorCard error={error} />
      </PortalLayout>
    );
  }

  if (!quotation) {
    return (
      <PortalLayout title="Quotation">
        <LoadingCard label="Quotation" />
      </PortalLayout>
    );
  }

  const status = portalStatus(quotation.status);
  // A quote that is confirmed, or back with the team, is read-only here.
  const open = quotation.status === 'APPROVED' || quotation.status === 'NEGOTIATION';
  const lineName = (lineId: string | null) =>
    quotation.lines.find((line) => line.id === lineId)?.product.name ?? 'This quotation';

  return (
    <PortalLayout
      title={`Quotation ${quotation.number}`}
      subtitle={status.detail}
      actions={
        <>
          <Badge variant={status.variant}>{status.label}</Badge>
          <Button variant="ghost" onClick={() => navigate('/portal/quotations')}>
            All quotations
          </Button>
          {open && (
            <>
              <Button variant="secondary" onClick={submitRequest} disabled={busy}>
                {busy ? 'Working…' : 'Submit Request'}
              </Button>
              <Button onClick={confirmQuotation} disabled={busy}>
                {busy ? 'Working…' : 'Confirm Quotation'}
              </Button>
            </>
          )}
        </>
      }
    >
      {error && (
        <div className="mb-lg">
          <ErrorCard error={error} />
        </div>
      )}

      {outcome && (
        <Card tone={outcome.outcome === 'CONFIRMED' ? 'lemon' : 'tangerine'} className="mb-lg">
          <CardLabel>{outcome.outcome === 'CONFIRMED' ? 'Confirmed' : 'Thank you'}</CardLabel>
          <p className="mt-xs text-title-md">
            {outcome.outcome === 'CONFIRMED'
              ? `Quotation confirmed — your order ${outcome.salesOrder?.number ?? ''} is being processed.`
              : 'Your updated terms need a quick internal review. We will come back to you shortly.'}
          </p>
          {outcome.appliedCounters.length > 0 && (
            <p className="mt-xs text-body-sm opacity-80">
              {outcome.appliedCounters.length} requested discount(s) applied to this quotation.
            </p>
          )}
        </Card>
      )}

      {notice && !outcome && (
        <Card tone="lemon" className="mb-lg">
          <CardLabel>Sent</CardLabel>
          <p className="mt-xs text-title-md">{notice}</p>
        </Card>
      )}

      <div className="mb-lg grid gap-gutter md:grid-cols-3">
        <Card tone="obsidian">
          <CardLabel>Order total</CardLabel>
          <p className="tabular mt-xs text-display-xl">{money(quotation.totalAmount)}</p>
          <p className="text-body-sm text-obsidian-muted">
            {quotation.lines.length} items · you save {money(quotation.discountAmount)}
          </p>
        </Card>
        <Card>
          <CardLabel>One-time</CardLabel>
          <p className="tabular mt-xs text-headline-lg text-ink">{money(quotation.oneTimeTotalAmount)}</p>
          <p className="text-body-sm text-ink-subtle">Charged once, when your order ships.</p>
        </Card>
        <Card>
          <CardLabel>Recurring</CardLabel>
          <p className="tabular mt-xs text-headline-lg text-ink">{money(quotation.recurringTotalAmount)}</p>
          <p className="text-body-sm text-ink-subtle">
            {Number(quotation.recurringTotalAmount) > 0
              ? 'Billed on each subscription period.'
              : 'No subscription on this quotation.'}
          </p>
        </Card>
      </div>

      <TableShell className="mb-lg">
        <TableToolbar>
          <div>
            <h2 className="text-title-md text-ink">What is on this quotation</h2>
            <p className="text-body-sm text-ink-subtle">
              {open
                ? 'Add a note or ask for a different discount on any line, then send it to your account manager.'
                : 'These are the agreed terms.'}
            </p>
          </div>
          {quotation.validUntil && (
            <Badge variant="neutral">Valid until {date(quotation.validUntil)}</Badge>
          )}
        </TableToolbar>

        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Unit price</Th>
              <Th className="text-right">Discount</Th>
              <Th className="text-right">Line total</Th>
              {open && <Th>Ask for a change</Th>}
            </tr>
          </thead>
          <tbody>
            {quotation.lines.map((line) => (
              <Tr key={line.id}>
                <Td>
                  <span className="block text-title-sm text-ink">{line.product.name}</span>
                  <span className="block text-label-md text-ink-subtle">
                    {line.description ?? line.product.sku}
                    {line.lineType === 'RECURRING' ? ' · subscription' : ''}
                  </span>
                </Td>
                <Td numeric>{Number(line.quantity)}</Td>
                <Td numeric>{money(line.unitPrice)}</Td>
                <Td numeric>{Number(line.discountPct)}%</Td>
                <Td numeric>{money(line.lineTotal)}</Td>
                {open && (
                  <Td>
                    <div className="flex flex-wrap items-center gap-xs">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={draftFor(line.id).counterDiscountPct}
                        aria-label={`Requested discount for ${line.product.name}`}
                        placeholder="%"
                        onChange={(event) =>
                          updateDraft(line.id, { counterDiscountPct: event.target.value })
                        }
                        className="frost-input tabular w-20 rounded-full px-sm py-[0.25rem] text-right text-body-md
                          focus:outline-none focus:ring-2 focus:ring-lemon/60"
                      />
                      <input
                        type="text"
                        value={draftFor(line.id).comment}
                        aria-label={`Comment on ${line.product.name}`}
                        placeholder="Add a note"
                        onChange={(event) => updateDraft(line.id, { comment: event.target.value })}
                        className="frost-input min-w-[10rem] flex-1 rounded-full px-md py-[0.25rem] text-body-md
                          placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60"
                      />
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableShell>

      {open && (
        <Card className="mb-lg">
          <CardLabel>Anything else?</CardLabel>
          <p className="mt-xs text-body-sm text-ink-subtle">
            A note about the whole quotation, and the date you would like it delivered by. Both are
            sent with Submit Request.
          </p>
          <div className="mt-md flex flex-wrap items-end gap-md">
            <label className="flex flex-1 flex-col gap-2xs">
              <span className="text-label-md text-ink-subtle">Message</span>
              <input
                type="text"
                value={orderComment}
                onChange={(event) => setOrderComment(event.target.value)}
                placeholder="Anything your account manager should know"
                className="frost-input w-full rounded-full px-md py-[0.45rem] text-body-md
                  placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-lemon/60"
              />
            </label>
            <label className="flex flex-col gap-2xs">
              <span className="text-label-md text-ink-subtle">Requested delivery date</span>
              <input
                type="date"
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                className="frost-input tabular rounded-full px-md py-[0.4rem] text-body-md
                  focus:outline-none focus:ring-2 focus:ring-lemon/60"
              />
            </label>
          </div>
        </Card>
      )}

      <Card>
        <CardLabel>Your requests</CardLabel>
        {quotation.negotiationRequests.length === 0 ? (
          <p className="mt-sm text-body-md text-ink-subtle">
            No requests yet — anything you ask for will be listed here.
          </p>
        ) : (
          <ul className="mt-md flex flex-col gap-sm">
            {quotation.negotiationRequests.map((request) => {
              const state = requestState(request.status);

              return (
                <li key={request.id} className="flex flex-wrap items-center gap-sm">
                  <Badge variant={state.variant}>{state.label}</Badge>
                  <span className="text-title-sm text-ink">{lineName(request.quotationLineId)}</span>
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
        )}
      </Card>
    </PortalLayout>
  );
}
