// Internal session tokens. The portal signs its own tokens with a different
// secret (portalTokenSecret), so a staff token can never open a portal session
// or the other way round.

import jwt from 'jsonwebtoken';
import type { AuthTokenPayload, RoleCode } from '@dealflow360/shared';

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
