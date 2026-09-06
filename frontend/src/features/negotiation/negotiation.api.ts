import type {
  NegotiationDecision,
  NegotiationListMeta,
  NegotiationRequestView,
  NegotiationRespondResult,
} from '@dealflow360/shared';

import { apiList, apiPost } from '../../lib/api-client';

/** The negotiation thread on one quotation, oldest request first. */
export function fetchNegotiations(quotationId: string) {
  return apiList<NegotiationRequestView, NegotiationListMeta>(
    `/quotations/${quotationId}/negotiations`,
  );
}

export function respondToNegotiation(
  requestId: string,
  decision: NegotiationDecision,
  responseNote: string | null,
) {
  return apiPost<NegotiationRespondResult>(`/negotiation-requests/${requestId}/respond`, {
    decision,
    responseNote,
  });
}
