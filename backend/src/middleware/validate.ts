// Parses request parts with a zod schema before the controller runs.

import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

import { ValidationError } from '../lib/errors';

type RequestPart = 'body' | 'params' | 'query';

export function validate(part: RequestPart, schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join('.') || part}: ${issue.message}`)
        .join('; ');
      next(new ValidationError(detail));
      return;
    }

    req[part] = result.data;
    next();
  };
}
