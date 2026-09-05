import type { ApiError } from '@dealflow360/shared';

import { Card, CardLabel } from './Card';

/** Shared loading and error surfaces so every screen fails the same way. */
export function LoadingCard({ label = 'Loading' }: { label?: string }) {
  return (
    <Card className="max-w-md">
      <CardLabel>{label}</CardLabel>
      <p className="mt-sm text-body-md text-ink-subtle">Fetching from the API…</p>
    </Card>
  );
}

export function ErrorCard({ error }: { error: ApiError }) {
  return (
    <Card className="max-w-lg border-danger/20">
      <CardLabel className="text-danger">{error.code}</CardLabel>
      <p role="alert" className="mt-sm text-body-md text-ink-body">
        {error.message}
      </p>
    </Card>
  );
}

export function EmptyCard({ message }: { message: string }) {
  return (
    <Card className="max-w-lg">
      <p className="text-body-md text-ink-subtle">{message}</p>
    </Card>
  );
}
