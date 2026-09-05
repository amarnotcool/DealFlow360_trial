import type { AuthUser, LoginResponse } from '@dealflow360/shared';

import { apiGet, apiPost } from '../../lib/api-client';

export function login(email: string, password: string) {
  return apiPost<LoginResponse>('/auth/login', { email, password });
}

/** Confirms a stored token still belongs to a live account. */
export function fetchMe() {
  return apiGet<AuthUser>('/auth/me');
}
