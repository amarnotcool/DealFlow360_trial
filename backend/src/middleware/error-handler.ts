// Converts thrown errors into the { data, error } envelope.

import type { NextFunction, Request, Response } from 'express';
import type { ApiResponse } from '@dealflow360/shared';

import { AppError } from '../lib/errors';

/**
 * body-parser's own failures, which are thrown before any route runs and so
 * never pass through `lib/errors.ts`.
 *
 * A body that is not valid JSON is a bad request, not a server fault — the
 * parser already says so, carrying its own status. Falling through to the
 * generic branch answered 500, which tells a caller to retry something that
 * can only ever fail, and buried a client bug in the server log.
 *
 * Only the types listed here are recognised; anything else still gets the
 * generic 500, so an unexpected failure is never quietly downgraded.
 */
const BODY_PARSER_FAILURES: Record<string, { status: number; code: string; message: string }> = {
  'entity.parse.failed': { status: 400, code: 'INVALID_JSON', message: 'The request body is not valid JSON' },
  'entity.too.large': { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large' },
  'encoding.unsupported': {
    status: 415,
    code: 'UNSUPPORTED_ENCODING',
    message: 'The request body uses an unsupported content encoding',
  },
};

function bodyParserFailure(error: unknown) {
  if (typeof error !== 'object' || error === null) return null;
  const type = (error as { type?: unknown }).type;
  return typeof type === 'string' ? (BODY_PARSER_FAILURES[type] ?? null) : null;
}

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

  const parseFailure = bodyParserFailure(error);
  if (parseFailure) {
    // The raw body is never echoed back: it is the caller's own text, and a
    // failed parse says nothing useful about which byte was wrong.
    res
      .status(parseFailure.status)
      .json({ data: null, error: { code: parseFailure.code, message: parseFailure.message } });
    return;
  }

  console.error(error);
  res.status(500).json({
    data: null,
    error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
  });
}
