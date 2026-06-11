import { priceFor } from './prices';

/**
 * The cost meter (plan §4.4). Every paid call in the app goes through
 * `spend()` — no exceptions (stretch contract #4). Persistence is injected
 * so this stays pure; the db layer writes events to the api_spend table.
 */

export interface SpendEvent {
  at: string;
  provider: string;
  feature: string;
  units: number;
  unit: string;
  costUsd: number;
}

/** Compute and record one paid call. `key` is "provider:feature". */
export function spend(key: string, units: number, now: Date): SpendEvent {
  const [provider, feature] = key.split(':');
  const price = priceFor(key);
  return {
    at: now.toISOString(),
    provider,
    feature,
    units,
    unit: price.unit,
    costUsd: units * price.unitPrice,
  };
}

export function monthToDateUsd(events: readonly SpendEvent[], now: Date): number {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return events
    .filter((e) => new Date(e.at) >= monthStart && new Date(e.at) <= now)
    .reduce((sum, e) => sum + e.costUsd, 0);
}

/**
 * Soft cap: at or over it, paid features switch off with a spoken notice
 * rather than failing silently (§4.4) — callers check this before any call.
 */
export function isOverCap(events: readonly SpendEvent[], capUsd: number, now: Date): boolean {
  return monthToDateUsd(events, now) >= capUsd;
}

/** "this week: 142 minutes, $0.43" — review/settings display helper. */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
