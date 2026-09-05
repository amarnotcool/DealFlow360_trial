// Thin controller (CLAUDE.md rule 2): shape a response, nothing else.
// The health probe deliberately touches no database.

import type { Request, Response } from 'express';
import type { ApiResponse, HealthStatus } from '@dealflow360/shared';

export function getHealth(_req: Request, res: Response<ApiResponse<HealthStatus>>): void {
  res.json({
    data: { status: 'ok', timestamp: new Date().toISOString() },
    error: null,
  });
}
