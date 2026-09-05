// Soft role guard: a route names the roles allowed to call it, and anything
// else is refused with 403. This is a role check, not a permission matrix —
// specs.md §2 describes what each role does, and the mapping lives with each
// module's routes.

import type { NextFunction, Request, Response } from 'express';
import type { RoleCode } from '@dealflow360/shared';

import { ForbiddenError } from '../lib/errors';
import { currentUser } from './auth';

/** ADMIN administers configuration; it is never silently added to a guard. */
export function requireRole(...allowed: RoleCode[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const user = currentUser(req);

      if (!allowed.includes(user.role)) {
        throw new ForbiddenError(
          `Role ${user.role} cannot perform this action — it needs ${allowed.join(' or ')}`,
        );
      }

      next();
    } catch (cause) {
      next(cause);
    }
  };
}
