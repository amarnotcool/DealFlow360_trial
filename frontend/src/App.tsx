// Vertical-slice shell: calls GET /health on mount and renders the result.
// This exists to prove CORS, env wiring, ports and the API client line up.

import { useEffect, useState } from 'react';
import type { ApiError, HealthStatus } from '@dealflow360/shared';

import { apiGet } from './lib/api-client';

export default function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiGet<HealthStatus>('/health').then((response) => {
      if (cancelled) {
        return;
      }
      setHealth(response.data);
      setError(response.error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>DealFlow360</h1>
      <h2>API health</h2>
      {error && (
        <p role="alert">
          {error.code}: {error.message}
        </p>
      )}
      {health && (
        <dl>
          <dt>status</dt>
          <dd>{health.status}</dd>
          <dt>timestamp</dt>
          <dd>{health.timestamp}</dd>
        </dl>
      )}
      {!health && !error && <p>Checking…</p>}
    </main>
  );
}
