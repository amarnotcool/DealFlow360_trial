// Mid-cycle proration (specs.md §4 "Hybrid billing").
//
// Pure logic (CLAUDE.md rule 1): no Prisma, no Express, no I/O. Plain objects
// in, plain objects out. The service resolves the subscription's current terms,
// the new terms and the cycle window and hands them in; this file calls nothing.
//
// The rule is time based. Both sides are reduced to a daily rate over the same
// cycle, and only the days still to run are re-priced:
//
//   dailyRateOld = oldPlanPrice * oldQuantity / daysInCycle
//   dailyRateNew = newPlanPrice * newQuantity / daysInCycle
//   prorationAmount = (dailyRateNew - dailyRateOld) * remainingDays
//
// A quantity change needs no separate rule: quantity is part of the effective
// price. A cancellation prices the new side at zero, so the amount is the credit
// for the unused part of the cycle.
//
// Money is held in integer paise for the arithmetic, so ₹5000 → ₹8000 with 15 of
// 30 days left is exactly ₹1500.00 and never ₹1499.9999999998.

import type { ProrationDirection, ProrationInput, ProrationResult } from '@dealflow360/shared';

const PAISE = 100;

const toPaise = (rupees: number): number => Math.round(rupees * PAISE);
const fromPaise = (paise: number): number => Number((paise / PAISE).toFixed(2));

function resolveDirection(amountPaise: number): ProrationDirection {
  if (amountPaise > 0) return 'CHARGE';
  if (amountPaise < 0) return 'CREDIT';
  return 'NONE';
}

export function computeProration(input: ProrationInput): ProrationResult {
  if (input.daysInCycle <= 0) {
    throw new Error('daysInCycle must be greater than zero');
  }
  if (input.remainingDays < 0 || input.remainingDays > input.daysInCycle) {
    throw new Error('remainingDays must be between zero and daysInCycle');
  }

  const isCancellation = input.type === 'CANCELLATION';

  const oldEffectivePaise = toPaise(input.oldPlanPrice) * input.oldQuantity;
  const newEffectivePaise = isCancellation ? 0 : toPaise(input.newPlanPrice) * input.newQuantity;

  // Multiply before dividing so the cycle division happens once, on the total.
  const deltaForRemainingDays =
    (newEffectivePaise - oldEffectivePaise) * input.remainingDays;
  const amountPaise = Math.round(deltaForRemainingDays / input.daysInCycle);

  const direction = resolveDirection(amountPaise);

  return {
    prorationAmount: fromPaise(amountPaise),
    direction,
    chargeAmount: amountPaise > 0 ? fromPaise(amountPaise) : 0,
    creditAmount: amountPaise < 0 ? fromPaise(-amountPaise) : 0,
    oldEffectivePrice: fromPaise(oldEffectivePaise),
    newEffectivePrice: fromPaise(newEffectivePaise),
    remainingDays: input.remainingDays,
    daysInCycle: input.daysInCycle,
  };
}

/** Days in one cycle of each billing frequency, as the proration maths uses them. */
export const DAYS_IN_CYCLE = {
  MONTHLY: 30,
  QUARTERLY: 90,
  ANNUAL: 365,
} as const;
