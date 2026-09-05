// Internal login. Email plus password, nothing else: no signup, no reset, no
// second factor, no refresh token — every one of those would be a route that
// does not work yet.

import bcrypt from 'bcryptjs';
import type { AuthUser, LoginResponse, RoleCode } from '@dealflow360/shared';

import { prisma } from '../../lib/prisma-client';
import { UnauthorizedError } from '../../lib/errors';
import { signInternalToken } from '../../lib/jwt';

const userWithRoles = {
  userRoles: { include: { role: { select: { code: true } } } },
} as const;

/**
 * A user can hold several roles; the guards check one. The most capable role
 * wins, so an account that is both Rep and Manager is treated as a Manager.
 */
const ROLE_RANK: Record<RoleCode, number> = {
  SALES_REP: 1,
  SALES_MANAGER: 2,
  FINANCE: 3,
  ADMIN: 4,
};

function primaryRole(codes: string[]): RoleCode {
  const known = codes.filter((code): code is RoleCode => code in ROLE_RANK);

  if (known.length === 0) {
    throw new UnauthorizedError('This account has no role and cannot sign in');
  }

  return known.reduce((best, code) => (ROLE_RANK[code] > ROLE_RANK[best] ? code : best));
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: userWithRoles,
  });

  // The same message for an unknown email and a wrong password, so the response
  // does not say which accounts exist.
  const invalid = new UnauthorizedError('Email or password is incorrect');

  if (!user || !user.isActive) {
    throw invalid;
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw invalid;
  }

  const role = primaryRole(user.userRoles.map((link) => link.role.code));

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    token: signInternalToken(user.id, role),
    user: { id: user.id, email: user.email, fullName: user.fullName, role },
  };
}

/** GET /auth/me — resolved from the token, never from a query parameter. */
export async function getMe(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userWithRoles });

  if (!user || !user.isActive) {
    throw new UnauthorizedError('This session belongs to an account that is no longer active');
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: primaryRole(user.userRoles.map((link) => link.role.code)),
  };
}
