// Internal (staff) authentication. The customer portal has its own session and
// its own types — nothing here is reused there.

/**
 * Role codes as they exist in the `role` table. A union rather than an enum so
 * the value can travel through a JWT and a request body without a runtime
 * import, the same shape the proration and payment types use.
 */
export type RoleCode = 'SALES_REP' | 'SALES_MANAGER' | 'FINANCE' | 'ADMIN';

export const ROLE_CODES: RoleCode[] = ['SALES_REP', 'SALES_MANAGER', 'FINANCE', 'ADMIN'];

/** The signed-in user, as GET /auth/me and POST /auth/login report them. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  /** The user's primary role — the one every guard is checked against. */
  role: RoleCode;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

/** What the JWT itself carries. Kept small: identity and role, nothing else. */
export interface AuthTokenPayload {
  sub: string;
  role: RoleCode;
}
