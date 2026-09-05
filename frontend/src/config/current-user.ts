// TODO(auth): the auth module is not built yet, so there is no session to read
// the acting user from. Until it lands, the ids of the seeded users stand in and
// every write sends one of them as `actorUserId` — the same placeholder the
// backend schemas document. This is the ONE place those ids appear; when auth
// arrives, delete this file and read the user from the session instead.

export interface ActingUser {
  id: string;
  fullName: string;
  role: 'SALES_REP' | 'SALES_MANAGER' | 'FINANCE';
}

export const SALES_REP: ActingUser = {
  id: '77777777-7777-4777-8777-000000000001',
  fullName: 'Riya Sales Rep',
  role: 'SALES_REP',
};

export const SALES_MANAGER: ActingUser = {
  id: '77777777-7777-4777-8777-000000000002',
  fullName: 'Manav Sales Manager',
  role: 'SALES_MANAGER',
};

export const FINANCE: ActingUser = {
  id: '77777777-7777-4777-8777-000000000003',
  fullName: 'Farah Finance',
  role: 'FINANCE',
};

/** Seeded customer a new draft is opened against, until a picker exists. */
export const DEFAULT_CUSTOMER_ID = '88888888-8888-4888-8888-000000000002';
