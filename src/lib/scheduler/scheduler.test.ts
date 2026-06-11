import { describe, expect, it } from 'vitest';
import {
  INTERVALS_DAYS,
  isDue,
  masteredItemIds,
  newMastery,
  recordOutcome,
  selectDueItems,
  type MasteryState,
} from './scheduler';

const T0 = new Date('2026-06-11T08:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function daysUntilDue(s: MasteryState, from: Date): number {
  return (new Date(s.dueAt!).getTime() - from.getTime()) / DAY;
}

describe('recordOutcome', () => {
  it('walks the 1/2/4/8/16-day ladder on consecutive passes', () => {
    let s = newMastery('id-f-001', T0);
    for (const expected of [1, 2, 4, 8, 16]) {
      s = recordOutcome(s, 'pass', T0);
      expect(daysUntilDue(s, T0)).toBe(expected);
    }
    expect(s.strength).toBe(5);
  });

  it('caps strength at 5', () => {
    let s = { ...newMastery('x', T0), strength: 5 };
    s = recordOutcome(s, 'pass', T0);
    expect(s.strength).toBe(5);
    expect(daysUntilDue(s, T0)).toBe(16);
  });

  it('halves the interval and demotes on a miss', () => {
    let s = { ...newMastery('x', T0), strength: 4 };
    s = recordOutcome(s, 'miss', T0);
    expect(s.strength).toBe(3);
    expect(daysUntilDue(s, T0)).toBe(INTERVALS_DAYS[3] / 2);
  });

  it('floors strength at 0 and makes the item due immediately', () => {
    let s = newMastery('x', T0);
    s = recordOutcome(s, 'miss', T0);
    expect(s.strength).toBe(0);
    expect(isDue(s, T0)).toBe(true);
  });

  it('keeps strength on a near but halves the interval', () => {
    let s = { ...newMastery('x', T0), strength: 3 };
    s = recordOutcome(s, 'near', T0);
    expect(s.strength).toBe(3);
    expect(daysUntilDue(s, T0)).toBe(INTERVALS_DAYS[3] / 2);
  });
});

describe('isDue / selectDueItems', () => {
  it('treats never-exercised items as due', () => {
    expect(isDue({ itemId: 'x', strength: 0, lastSeenAt: null, dueAt: null }, T0)).toBe(true);
  });

  it('is not due before dueAt', () => {
    const s = recordOutcome(newMastery('x', T0), 'pass', T0);
    expect(isDue(s, T0)).toBe(false);
    expect(isDue(s, new Date(T0.getTime() + 1 * DAY))).toBe(true);
  });

  it('orders weakest first, then most overdue, and respects the limit', () => {
    const mk = (id: string, strength: number, dueOffsetDays: number): MasteryState => ({
      itemId: id,
      strength,
      lastSeenAt: T0.toISOString(),
      dueAt: new Date(T0.getTime() + dueOffsetDays * DAY).toISOString(),
    });
    const picked = selectDueItems(
      [mk('strong-overdue', 4, -5), mk('weak-recent', 1, -1), mk('weak-older', 1, -3), mk('not-due', 0, +2)],
      T0,
      2,
    );
    expect(picked.map((s) => s.itemId)).toEqual(['weak-older', 'weak-recent']);
  });
});

describe('masteredItemIds (vocabulary whitelist)', () => {
  it('returns items at or above the strength floor', () => {
    const states: MasteryState[] = [
      { itemId: 'a', strength: 5, lastSeenAt: null, dueAt: null },
      { itemId: 'b', strength: 3, lastSeenAt: null, dueAt: null },
      { itemId: 'c', strength: 2, lastSeenAt: null, dueAt: null },
    ];
    expect(masteredItemIds(states)).toEqual(['a', 'b']);
  });
});
