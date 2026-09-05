// Converts thrown errors into the { data, error } envelope.

import type { NextFunction, Request, Response } from 'express';
import type { ApiResponse } from '@dealflow360/shared';

import { AppError } from '../lib/errors';

export function notFoundHandler(_req: Request, res: Response<ApiResponse<never>>): void {
  res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response<ApiResponse<never>>,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ data: null, error: { code: error.code, message: error.message } });
    return;
  }

  console.error(error);
  res.status(500).json({
    data: null,
    error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
  });
}
