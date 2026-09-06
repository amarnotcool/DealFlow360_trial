// The customer's side of the conversation, on the quote the rep is working.
//
// specs.md §2 gives the Sales Rep "respond to negotiation requests". Everything
// here comes from GET /quotations/:id/negotiations: the counter the customer
// asked for, the rate the line actually carries, and — once someone answers —
// who answered and what they said.
//
// Accepting a counter reprices the line and reruns the discount engine, so the
// API's own outcome is what this reports back. It is never paraphrased: if the
// agreed rate broke a ceiling and the quote re-entered approval, that is what
// the strip says, with the chain the API returned.

import { useState } from 'react';
import type { NegotiationRequestView, NegotiationStatus } from '@dealflow360/shared';

import {
  Badge,
  Button,
  Card,
  CardLabel,
  ErrorCard,
  FIELD_CLASS,
} from '../../../../components/ui';
import type { BadgeVariant } from '../../../../components/ui/Badge';
import { useAuth } from '../../../../features/auth/useAuth';
import { useNegotiation } from '../../../../features/negotiation/useNegotiation';
import { date, dateTime, humanise, percent } from '../../../../lib/format';
import { NEGOTIATION_RESPOND_ROLES } from '../../../../routes/access';

/** Staff-facing wording. The portal words the same states for the customer. */
const STATUS: Record<NegotiationStatus, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Awaiting reply', variant: 'primary' },
  ACCEPTED: { label: 'Accepted', variant: 'info' },
  REJECTED: { label: 'Rejected', variant: 'critical' },
  WITHDRAWN: { label: 'Withdrawn', variant: 'neutral' },
};

interface NegotiationPanelProps {
  quotationId: string;
  /** Re-reads the quotation after an answer moves its lines or its status. */
  onQuotationChanged: () => void;
}

export default function NegotiationPanel({
  quotationId,
  onQuotationChanged,
}: NegotiationPanelProps) {
  const { user } = useAuth();
  // Finance reads a quote but does not haggle over its discounts — the API
  // refuses it a response either way (403).
  const canRespond = user ? NEGOTIATION_RESPOND_ROLES.includes(user.role) : false;

  const { requests, meta, error, busy, outcome, respond } = useNegotiation(
    quotationId,
    onQuotationChanged,
  );

  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  // Nothing has ever been asked on this quote: no empty box on the screen.
  if (requests !== null && requests.length === 0) return null;

  function startAnswer(requestId: string) {
    setOpenId(requestId);
    setNote('');
    setNoteError(null);
  }

  async function send(request: NegotiationRequestView, decision: 'ACCEPT' | 'REJECT') {
    const trimmed = note.trim();

    // A rejection has to say why — the customer reads this on their own screen.
    if (decision === 'REJECT' && trimmed.length === 0) {
      setNoteError('Say why this cannot be done — the customer sees this reply.');
      return;
    }

    setNoteError(null);
    const result = await respond(request.id, decision, trimmed.length > 0 ? trimmed : null);
    if (result) {
      setOpenId(null);
      setNote('');
    }
  }

  return (
    <Card className="mt-lg">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <CardLabel>Customer requests</CardLabel>
          <p className="mt-2xs text-body-sm text-ink-subtle">
            What the customer asked for from the portal, and what was answered.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-xs">
          {meta.pending > 0 && (
            <Badge variant="primary">
              {meta.pending} awaiting reply
            </Badge>
          )}
          <Badge variant="neutral">{meta.total} total</Badge>
        </div>
      </div>

      {error && (
        <div className="mt-md">
          <ErrorCard error={error} />
        </div>
      )}

      {outcome && (
        <div className="mt-md">
          {outcome.outcome === 'RE_APPROVAL' ? (
            <Card tone="tangerine">
              <CardLabel>Back in approval</CardLabel>
              <p className="mt-xs text-body-md">
                The rate you accepted is over the line&apos;s ceiling, so{' '}
                {outcome.quotation.number} re-entered approval on its own — now{' '}
                {humanise(outcome.quotation.status)} at {outcome.quotation.riskScore} (
                {outcome.quotation.riskLevel}).
              </p>
              <p className="tabular mt-2xs text-body-sm">
                Chain: {outcome.approvalChain.map((level) => humanise(level)).join(' → ')}
              </p>
            </Card>
          ) : (
            <Card tone="lemon">
              <CardLabel>Answered</CardLabel>
              <p className="mt-xs text-body-md">
                {outcome.outcome === 'ACCEPTED'
                  ? outcome.appliedDiscountPct
                    ? `Accepted — the line is now discounted ${percent(outcome.appliedDiscountPct)} and the quote re-priced to ${outcome.quotation.riskLevel} risk.`
                    : 'Accepted — nothing to re-price on a request that carries no counter.'
                  : 'Rejected — the line is unchanged.'}
              </p>
            </Card>
          )}
        </div>
      )}

      {requests === null ? (
        <p className="mt-md text-body-sm text-ink-subtle">Loading requests…</p>
      ) : (
        <ol className="mt-md flex flex-col gap-md">
          {requests.map((request) => {
            const state = STATUS[request.status];
            const answering = openId === request.id;

            return (
              <li
                key={request.id}
                className="rounded-vessel border border-white/70 bg-white/50 px-lg py-md"
              >
                <div className="flex flex-wrap items-center gap-sm">
                  <Badge variant={state.variant}>{state.label}</Badge>
                  <span className="text-title-sm text-ink">
                    {request.line ? request.line.product.name : 'Whole quotation'}
                  </span>
                  {request.line && (
                    <span className="text-label-md text-ink-subtle">{request.line.product.sku}</span>
                  )}
                  <span className="tabular ml-auto text-body-sm text-ink-subtle">
                    {dateTime(request.createdAt)}
                  </span>
                </div>

                {/* The comparison the desk is actually deciding on. */}
                {request.counterDiscountPct && request.line && (
                  <div className="mt-sm flex flex-wrap items-center gap-sm">
                    <span className="text-body-sm text-ink-subtle">Line is at</span>
                    <span className="tabular text-title-sm text-ink">
                      {percent(request.line.discountPct)}
                    </span>
                    <span aria-hidden className="text-ink-subtle">
                      →
                    </span>
                    <span className="text-body-sm text-ink-subtle">customer asked for</span>
                    <Badge variant="critical" className="tabular">
                      {percent(request.counterDiscountPct)}
                    </Badge>
                  </div>
                )}

                {request.requestedDeliveryDate && (
                  <p className="mt-xs text-body-sm text-ink-body">
                    Wants delivery by {date(request.requestedDeliveryDate)}
                  </p>
                )}

                {request.comment && (
                  <p className="mt-xs text-body-md text-ink-body">“{request.comment}”</p>
                )}

                <p className="mt-xs text-body-sm text-ink-subtle">
                  Asked by {request.contact.fullName}
                </p>

                {request.respondedBy && (
                  <p className="mt-xs text-body-sm text-ink">
                    {request.status === 'ACCEPTED' ? 'Accepted' : 'Rejected'} by{' '}
                    {request.respondedBy.fullName} · {dateTime(request.respondedAt)}
                    {request.responseNote && <> — “{request.responseNote}”</>}
                  </p>
                )}

                {canRespond && request.status === 'PENDING' && (
                  <div className="mt-md">
                    {answering ? (
                      <div className="flex flex-col gap-sm">
                        <textarea
                          rows={2}
                          value={note}
                          aria-label={`Reply to ${request.contact.fullName}`}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="What should the customer read back? Required to reject."
                          className={`${FIELD_CLASS} rounded-md`}
                        />
                        {noteError && (
                          <p role="alert" className="text-body-sm text-danger">
                            {noteError}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-xs">
                          <Button disabled={busy} onClick={() => void send(request, 'ACCEPT')}>
                            {busy ? 'Working…' : 'Accept'}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void send(request, 'REJECT')}
                          >
                            {busy ? 'Working…' : 'Reject'}
                          </Button>
                          <Button variant="ghost" disabled={busy} onClick={() => setOpenId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="secondary" onClick={() => startAnswer(request.id)}>
                        Respond
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {!canRespond && meta.pending > 0 && (
        <p className="mt-md text-body-sm text-ink-subtle">
          Read only — the sales desk answers these.
        </p>
      )}
    </Card>
  );
}
