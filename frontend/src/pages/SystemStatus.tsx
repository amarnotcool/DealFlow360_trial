// Keeps the step-5 vertical slice visible: calls GET /health and renders it.
// Not a product screen.

import { useEffect, useState } from 'react';
import type { ApiError, HealthStatus } from '@dealflow360/shared';

import { InternalLayout } from '../components/layout/InternalLayout';
import { Badge, Card, CardLabel } from '../components/ui';
import { apiGet } from '../lib/api-client';

export default function SystemStatus() {
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
    <InternalLayout breadcrumb={['DealFlow360']} title="System status">
      <Card className="max-w-md">
        <CardLabel>API health</CardLabel>
        {error && (
          <p role="alert" className="mt-sm text-body-md text-danger">
            {error.code}: {error.message}
          </p>
        )}
        {health && (
          <div className="mt-sm flex items-center gap-md">
            <Badge variant="info">{health.status}</Badge>
            <span className="tabular text-body-sm text-ink-subtle">{health.timestamp}</span>
          </div>
        )}
        {!health && !error && <p className="mt-sm text-body-md text-ink-subtle">Checking…</p>}
      </Card>
    </InternalLayout>
  );
}
