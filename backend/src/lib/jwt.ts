// Internal session tokens. The portal signs its own tokens with a different
// secret (portalTokenSecret), so a staff token can never open a portal session
// or the other way round.

import jwt from 'jsonwebtoken';
import type { AuthTokenPayload, PortalTokenPayload, RoleCode } from '@dealflow360/shared';

import { env } from '../config/env';
import { UnauthorizedError } from './errors';

/** One working day: long enough for a session, short enough to expire. */
const TOKEN_TTL = '8h';

export function signInternalToken(userId: string, role: RoleCode): string {
  return jwt.sign({ sub: userId, role } satisfies AuthTokenPayload, env.jwtSecret, {
    expiresIn: TOKEN_TTL,
  });
}

/** Verifies a token, or throws the 401 the auth middleware reports. */
export function verifyInternalToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);

    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.role !== 'string') {
      throw new UnauthorizedError('Token is missing its user or role');
    }

    return { sub: decoded.sub, role: decoded.role as RoleCode };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      throw cause;
    }
    throw new UnauthorizedError('Session token is invalid or has expired');
  }
}

// ---------------------------------------------------------------------------
// Portal tokens — signed with portalTokenSecret, so a staff token verified with
// this secret fails and a portal token verified with the staff secret fails.
// ---------------------------------------------------------------------------

export function signPortalToken(contactId: string, customerId: string): string {
  return jwt.sign({ sub: contactId, customerId } satisfies PortalTokenPayload, env.portalTokenSecret, {
    expiresIn: TOKEN_TTL,
  });
}

export function verifyPortalToken(token: string): PortalTokenPayload {
  try {
    const decoded = jwt.verify(token, env.portalTokenSecret);

    if (
      typeof decoded === 'string' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.customerId !== 'string'
    ) {
      throw new UnauthorizedError('Portal token is missing its contact or customer');
    }

    return { sub: decoded.sub, customerId: decoded.customerId };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      throw cause;
    }
    throw new UnauthorizedError('Portal session token is invalid or has expired');
  }
}
