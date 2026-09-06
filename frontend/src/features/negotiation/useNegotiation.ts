// The negotiation thread on one quotation: loading it, and answering a request.
//
// Answering a counter can reprice the quotation and push it back into approval,
// so the hook reports what the API said happened and lets the screen above it
// re-read the quote rather than guessing at the new state.

import { useCallback, useEffect, useState } from 'react';
import type {
  ApiError,
  NegotiationDecision,
  NegotiationListMeta,
  NegotiationRequestView,
  NegotiationRespondResult,
} from '@dealflow360/shared';

import { fetchNegotiations, respondToNegotiation } from './negotiation.api';

const EMPTY_META: NegotiationListMeta = {
  total: 0,
  byStatus: { PENDING: 0, ACCEPTED: 0, REJECTED: 0, WITHDRAWN: 0 },
  pending: 0,
};

export interface NegotiationState {
  /** Null until the first load lands. */
  requests: NegotiationRequestView[] | null;
  meta: NegotiationListMeta;
  error: ApiError | null;
  busy: boolean;
  /** What the last answer did, until the next one clears it. */
  outcome: NegotiationRespondResult | null;
  respond: (
    requestId: string,
    decision: NegotiationDecision,
    responseNote: string | null,
  ) => Promise<NegotiationRespondResult | null>;
  reload: () => Promise<void>;
}

export function useNegotiation(
  quotationId: string,
  /** Called after an answer changes the quotation, so the screen can re-read it. */
  onQuotationChanged?: () => void,
): NegotiationState {
  const [requests, setRequests] = useState<NegotiationRequestView[] | null>(null);
  const [meta, setMeta] = useState<NegotiationListMeta>(EMPTY_META);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<NegotiationRespondResult | null>(null);

  const reload = useCallback(async () => {
    const response = await fetchNegotiations(quotationId);
    setRequests(response.data ?? []);
    setMeta(response.meta ?? EMPTY_META);
    setError(response.error);
  }, [quotationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const respond = useCallback(
    async (requestId: string, decision: NegotiationDecision, responseNote: string | null) => {
      setBusy(true);
      setError(null);
      const response = await respondToNegotiation(requestId, decision, responseNote);
      setBusy(false);

      if (!response.data) {
        // A request answered by someone else comes back 409; the API's own
        // message is what the desk should read, so it is shown as-is.
        setError(response.error);
        await reload();
        return null;
      }

      setOutcome(response.data);
      await reload();
      onQuotationChanged?.();
      return response.data;
    },
    [reload, onQuotationChanged],
  );

  return { requests, meta, error, busy, outcome, respond, reload };
}
