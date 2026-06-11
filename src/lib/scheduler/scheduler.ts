import type { MatchResult } from '../matching';

/**
 * Lightweight spaced recycler (plan §3.2). Not flashcards: due items are
 * woven into new sentence prompts as components. Strength 0–5; an item's
 * next appearance is INTERVALS_DAYS[strength] after it was last seen.
 */
export interface MasteryState {
  itemId: string;
  /** 0 = just taught / shaky, 5 = solid. */
  strength: number;
  lastSeenAt: string | null;
  /** null = never exercised; treat as due. */
  dueAt: string | null;
}

/** Indexed by strength. Strength 0 is due immediately (next session). */
export const INTERVALS_DAYS = [0, 1, 2, 4, 8, 16] as const;

export const MAX_STRENGTH = 5;

export function newMastery(itemId: string, now: Date): MasteryState {
  return { itemId, strength: 0, lastSeenAt: now.toISOString(), dueAt: now.toISOString() };
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Outcome rules:
 *  - pass: strength +1 (capped), full interval for the new strength.
 *  - near: strength unchanged, interval halved — it wobbled, see it sooner,
 *    but a near-miss is information, not failure (plan §2.4): no demotion.
 *  - miss: strength −1 (floored), and that strength's interval halved.
 */
export function recordOutcome(state: MasteryState, result: MatchResult, now: Date): MasteryState {
  let strength = state.strength;
  let intervalDays: number;
  switch (result) {
    case 'pass':
      strength = Math.min(MAX_STRENGTH, strength + 1);
      intervalDays = INTERVALS_DAYS[strength];
      break;
    case 'near':
      intervalDays = INTERVALS_DAYS[strength] / 2;
      break;
    case 'miss':
      strength = Math.max(0, strength - 1);
      intervalDays = INTERVALS_DAYS[strength] / 2;
      break;
  }
  return {
    itemId: state.itemId,
    strength,
    lastSeenAt: now.toISOString(),
    dueAt: addDays(now, intervalDays).toISOString(),
  };
}

export function isDue(state: MasteryState, now: Date): boolean {
  if (state.dueAt === null) return true;
  return new Date(state.dueAt).getTime() <= now.getTime();
}

/**
 * Pick which due items today's prompts should recycle: weakest first, then
 * most overdue, so a missed structure resurfaces before a merely-stale one.
 */
export function selectDueItems(states: readonly MasteryState[], now: Date, limit: number): MasteryState[] {
  return states
    .filter((s) => isDue(s, now))
    .sort((a, b) => {
      if (a.strength !== b.strength) return a.strength - b.strength;
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : 0;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : 0;
      return aDue - bDue;
    })
    .slice(0, limit);
}

/** Stretch contract #3: mastery as a vocabulary whitelist (S1 conversation mode). */
export function masteredItemIds(states: readonly MasteryState[], minStrength = 3): string[] {
  return states.filter((s) => s.strength >= minStrength).map((s) => s.itemId);
}
