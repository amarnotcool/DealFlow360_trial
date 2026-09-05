// One place that turns a plaintext password into a stored hash.
//
// The cost factor has to match what the seed and the login comparisons use —
// bcrypt reads it back out of the hash, so a mismatch would silently make
// seeded and API-created accounts behave differently under load.

import bcrypt from 'bcryptjs';

const COST = 10;

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST);
}
