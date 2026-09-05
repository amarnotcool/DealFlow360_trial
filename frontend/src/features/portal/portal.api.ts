// Customer portal API calls. Every one of these is sent with the portal
// session, never the staff one (CLAUDE.md rule 4).

import type {
  PortalConfirmResult,
  PortalLoginResponse,
  PortalNegotiationInput,
  PortalQuotationDetailView,
  PortalQuotationListItem,
  PortalUser,
} from '@dealflow360/shared';

import { apiGet, apiList, apiPost } from '../../lib/api-client';

export function portalLogin(email: string, password: string) {
  return apiPost<PortalLoginResponse>('/portal/auth/login', { email, password }, 'portal');
}

/** Confirms a stored portal token still belongs to an active contact. */
export function fetchPortalMe() {
  return apiGet<PortalUser>('/portal/auth/me', 'portal');
}

export function fetchPortalQuotations() {
  return apiList<PortalQuotationListItem>('/portal/quotations', 'portal');
}

export function fetchPortalQuotation(id: string) {
  return apiGet<PortalQuotationDetailView>(`/portal/quotations/${id}`, 'portal');
}

export function sendNegotiation(id: string, requests: PortalNegotiationInput[]) {
  return apiPost<PortalQuotationDetailView>(`/portal/quotations/${id}/negotiate`, { requests }, 'portal');
}

/** Over a ceiling this re-enters approval; otherwise it becomes an order. */
export function confirmPortalQuotation(id: string) {
  return apiPost<PortalConfirmResult>(`/portal/quotations/${id}/confirm`, {}, 'portal');
}
