// Proration engine tests. Inputs are built here: the engine is pure, so a test
// needs no database and no seeded subscription.

import { describe, expect, it } from 'vitest';
import { ProrationType, type ProrationInput } from '@dealflow360/shared';

import { computeProration } from '../src/modules/subscriptions/proration';

const MONTHLY: Pick<ProrationInput, 'daysInCycle' | 'remainingDays'> = {
  daysInCycle: 30,
  remainingDays: 15,
};

describe('computeProration', () => {
  it('charges the difference for the rest of the cycle on an upgrade', () => {
    const result = computeProration({
      type: ProrationType.UPGRADE,
      oldPlanPrice: 5000,
      oldQuantity: 1,
      newPlanPrice: 8000,
      newQuantity: 1,
      ...MONTHLY,
    });

    // (8000 - 5000) / 30 * 15
    expect(result.prorationAmount).toBe(1500);
    expect(result.direction).toBe('CHARGE');
    expect(result.chargeAmount).toBe(1500);
    expect(result.creditAmount).toBe(0);
  });

  it('credits the difference on a downgrade', () => {
    const result = computeProration({
      type: ProrationType.DOWNGRADE,
      oldPlanPrice: 8000,
      oldQuantity: 1,
      newPlanPrice: 5000,
      newQuantity: 1,
      ...MONTHLY,
    });

    expect(result.prorationAmount).toBe(-1500);
    expect(result.direction).toBe('CREDIT');
    expect(result.creditAmount).toBe(1500);
    expect(result.chargeAmount).toBe(0);
  });

  it('prices a quantity change with the same rule', () => {
    const result = computeProration({
      type: ProrationType.QUANTITY_CHANGE,
      oldPlanPrice: 5000,
      oldQuantity: 1,
      newPlanPrice: 5000,
      newQuantity: 2,
      ...MONTHLY,
    });

    // One extra seat at 5000 for half the cycle.
    expect(result.oldEffectivePrice).toBe(5000);
    expect(result.newEffectivePrice).toBe(10000);
    expect(result.prorationAmount).toBe(2500);
    expect(result.direction).toBe('CHARGE');
  });

  it('credits the unused part of the cycle on cancellation', () => {
    const result = computeProration({
      type: ProrationType.CANCELLATION,
      oldPlanPrice: 5000,
      oldQuantity: 2,
      newPlanPrice: 0,
      newQuantity: 0,
      daysInCycle: 30,
      remainingDays: 6,
    });

    // 10000 / 30 * 6
    expect(result.prorationAmount).toBe(-2000);
    expect(result.direction).toBe('CREDIT');
    expect(result.creditAmount).toBe(2000);
  });

  it('charges nothing when the change lands on the cycle boundary', () => {
    const result = computeProration({
      type: ProrationType.UPGRADE,
      oldPlanPrice: 5000,
      oldQuantity: 1,
      newPlanPrice: 8000,
      newQuantity: 1,
      daysInCycle: 30,
      remainingDays: 0,
    });

    expect(result.prorationAmount).toBe(0);
    expect(result.direction).toBe('NONE');
  });

  it('keeps a repeating daily rate exact', () => {
    const result = computeProration({
      type: ProrationType.UPGRADE,
      oldPlanPrice: 0,
      oldQuantity: 1,
      newPlanPrice: 1000,
      newQuantity: 1,
      daysInCycle: 30,
      remainingDays: 7,
    });

    // 1000 / 30 = 33.333… per day; seven days is 233.33 to the paisa.
    expect(result.prorationAmount).toBe(233.33);
  });

  it('rejects a window it cannot price', () => {
    expect(() =>
      computeProration({
        type: ProrationType.UPGRADE,
        oldPlanPrice: 5000,
        oldQuantity: 1,
        newPlanPrice: 8000,
        newQuantity: 1,
        daysInCycle: 30,
        remainingDays: 31,
      }),
    ).toThrow('remainingDays must be between zero and daysInCycle');
  });
});
