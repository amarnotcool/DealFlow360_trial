// Customer portal session middleware (CLAUDE.md rule 4).
//
// Deliberately separate from middleware/auth.ts: a different secret, a different
// request field, and a different notion of who is acting. A customer changing a
// URL cannot reach an internal endpoint, because internal routes read req.user,
// which this middleware never sets.

import type { NextFunction, Request, Response } from 'express';

import { UnauthorizedError } from '../lib/errors';
import { verifyPortalToken } from '../lib/jwt';

export interface PortalSession {
  contactId: string;
  /** Every portal read and write is scoped to this customer. */
  customerId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `portalAuth`. Never set on internal routes. */
      portalUser?: PortalSession;
    }
  }
}

export function portalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    next(new UnauthorizedError('No portal session token was sent'));
    return;
  }

  try {
    const payload = verifyPortalToken(header.slice('Bearer '.length).trim());
    req.portalUser = { contactId: payload.sub, customerId: payload.customerId };
    next();
  } catch (cause) {
    next(cause);
  }
}

export function currentPortalUser(req: Request): PortalSession {
  if (!req.portalUser) {
    throw new UnauthorizedError('This route needs a signed-in portal contact');
  }
  return req.portalUser;
}
