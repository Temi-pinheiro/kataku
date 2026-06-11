/**
 * Unit prices for every paid API the app can touch (plan §4.4). Price
 * changes are a one-line edit here. Snapshot June 2026 — re-verify before
 * relying on any figure.
 */

export interface PriceEntry {
  /** USD per unit. */
  unitPrice: number;
  /** What one unit is: 'minute', '1k_tokens', '1k_chars', 'call'. */
  unit: string;
}

export const PRICES: Record<string, PriceEntry> = {
  // The live MT teacher (owner pivot 2026-06-11) — gpt-4o-mini class.
  'openai:teacher_input': { unitPrice: 0.00015, unit: '1k_tokens' },
  'openai:teacher_output': { unitPrice: 0.0006, unit: '1k_tokens' },
  // Runtime TTS for dynamic teacher lines, cached per line on disk.
  'openai:tts_runtime': { unitPrice: 0.012, unit: '1k_chars' },
  // LLM coach, Tier 1 (plan §4.3) — small model, a few hundred tokens/call.
  'anthropic:coach_input': { unitPrice: 0.001, unit: '1k_tokens' },
  'anthropic:coach_output': { unitPrice: 0.005, unit: '1k_tokens' },
  // Cloud STT fallback (plan §4.2).
  'openai:stt_fallback': { unitPrice: 0.003, unit: 'minute' },
  // One-off runtime TTS for coach replies when device TTS is too rough.
  'openai:tts_dynamic': { unitPrice: 0.015, unit: 'minute' },
  // S2 tone scoring (stretch) — Azure pronunciation assessment family.
  'azure:tone_assess': { unitPrice: 0.017, unit: 'minute' },
};

export const DEFAULT_MONTHLY_CAP_USD = 10;

export function priceFor(key: string): PriceEntry {
  const entry = PRICES[key];
  if (!entry) throw new Error(`No price configured for "${key}" — add it to src/lib/cost/prices.ts`);
  return entry;
}
