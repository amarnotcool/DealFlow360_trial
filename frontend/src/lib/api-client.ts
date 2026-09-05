// Typed fetch wrapper around the backend's { data, error } envelope.
// Every feature module in frontend/src/features/ should call the API through
// this, so error handling stays in one place.

import type { ApiError, ApiResponse } from '@dealflow360/shared';

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/** Network and parse failures are reported in the same envelope as API errors. */
function transportError(message: string): ApiError {
  return { code: 'NETWORK_ERROR', message };
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    });

    const body = (await response.json()) as ApiResponse<T>;

    if (!response.ok && body.error === null) {
      return { data: null, error: { code: `HTTP_${response.status}`, message: response.statusText } };
    }

    return body;
  } catch (cause) {
    return { data: null, error: transportError(cause instanceof Error ? cause.message : 'Request failed') };
  }
}

export function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  return apiRequest<T>(path, { method: 'GET' });
}
