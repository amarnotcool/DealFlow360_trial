// Internal session middleware.
//
// Every internal write reads its acting user from here — `actorUserId` is never
// accepted from a request body, so the audit log cannot be written on behalf of
// somebody else (CLAUDE.md rule 5).

import type { NextFunction, Request, Response } from 'express';
import type { RoleCode } from '@dealflow360/shared';

import { UnauthorizedError } from '../lib/errors';
import { verifyInternalToken } from '../lib/jwt';

export interface SessionUser {
  id: string;
  role: RoleCode;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `auth`. Absent on public routes. */
      user?: SessionUser;
    }
  }
}

/** Reads `Authorization: Bearer <token>` and puts the user on the request. */
export function auth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    next(new UnauthorizedError('No session token was sent'));
    return;
  }

  try {
    const payload = verifyInternalToken(header.slice('Bearer '.length).trim());
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (cause) {
    next(cause);
  }
}

/**
 * The acting user of the current request. Services take this id; nothing takes
 * an actor from the client.
 */
export function currentUser(req: Request): SessionUser {
  if (!req.user) {
    throw new UnauthorizedError('This route needs a signed-in user');
  }
  return req.user;
}
