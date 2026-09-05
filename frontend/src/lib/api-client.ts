// Typed fetch wrapper around the backend's { data, error } envelope.
// Every feature module in frontend/src/features/ should call the API through
// this, so error handling stays in one place.
//
// There are two surfaces and two sessions (CLAUDE.md rule 4): the internal
// workspace and the customer portal. They keep separate tokens under separate
// storage keys, and a request says which surface it belongs to — a portal call
// can never be sent with a staff token, or the other way round.

import type { ApiError, ApiResponse } from '@dealflow360/shared';

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export type Surface = 'internal' | 'portal';

const TOKEN_KEY: Record<Surface, string> = {
  internal: 'dealflow360.token',
  portal: 'dealflow360.portalToken',
};

/**
 * A rejected session is an app-wide event, not one screen's error: the matching
 * provider listens for it and drops the user back at its own login page.
 */
export const SESSION_EXPIRED_EVENT = 'dealflow360:session-expired';
export const PORTAL_SESSION_EXPIRED_EVENT = 'dealflow360:portal-session-expired';

const EXPIRED_EVENT: Record<Surface, string> = {
  internal: SESSION_EXPIRED_EVENT,
  portal: PORTAL_SESSION_EXPIRED_EVENT,
};

const tokens: Record<Surface, string | null> = {
  internal: readStoredToken('internal'),
  portal: readStoredToken('portal'),
};

function readStoredToken(surface: Surface): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY[surface]);
  } catch {
    // Storage can be blocked; the session then lasts only as long as the tab.
    return null;
  }
}

function setToken(surface: Surface, next: string | null): void {
  tokens[surface] = next;
  try {
    if (next) window.localStorage.setItem(TOKEN_KEY[surface], next);
    else window.localStorage.removeItem(TOKEN_KEY[surface]);
  } catch {
    // Ignored for the same reason as above.
  }
}

export function setAuthToken(next: string | null): void {
  setToken('internal', next);
}

export function getAuthToken(): string | null {
  return tokens.internal;
}

export function setPortalToken(next: string | null): void {
  setToken('portal', next);
}

export function getPortalToken(): string | null {
  return tokens.portal;
}

/** Network and parse failures are reported in the same envelope as API errors. */
function transportError(message: string): ApiError {
  return { code: 'NETWORK_ERROR', message };
}

export interface RequestOptions extends RequestInit {
  /** Which session signs the request. Defaults to the internal workspace. */
  surface?: Surface;
}

export async function apiRequest<T>(path: string, init?: RequestOptions): Promise<ApiResponse<T>> {
  const surface: Surface = init?.surface ?? 'internal';
  const token = tokens[surface];

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });

    const body = (await response.json()) as ApiResponse<T>;

    if (response.status === 401) {
      setToken(surface, null);
      window.dispatchEvent(new CustomEvent(EXPIRED_EVENT[surface]));
    }

    if (!response.ok && body.error === null) {
      return { data: null, error: { code: `HTTP_${response.status}`, message: response.statusText } };
    }

    return body;
  } catch (cause) {
    return { data: null, error: transportError(cause instanceof Error ? cause.message : 'Request failed') };
  }
}

export function apiGet<T>(path: string, surface?: Surface): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: 'GET', surface });
}

/** List endpoints add a meta block alongside the envelope. */
export type ApiListResponse<T, M = { total: number }> = ApiResponse<T[]> & { meta?: M };

export async function apiList<T, M = { total: number }>(
  path: string,
  surface?: Surface,
): Promise<ApiListResponse<T, M>> {
  return (await apiRequest<T[]>(path, { method: 'GET', surface })) as ApiListResponse<T, M>;
}

function withBody<T>(
  method: string,
  path: string,
  body: unknown,
  surface?: Surface,
): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method, body: JSON.stringify(body), surface });
}

export function apiPost<T>(path: string, body: unknown, surface?: Surface): Promise<ApiResponse<T>> {
  return withBody<T>('POST', path, body, surface);
}

export function apiPatch<T>(path: string, body: unknown, surface?: Surface): Promise<ApiResponse<T>> {
  return withBody<T>('PATCH', path, body, surface);
}

export function apiDelete<T>(path: string, body: unknown, surface?: Surface): Promise<ApiResponse<T>> {
  return withBody<T>('DELETE', path, body, surface);
}
