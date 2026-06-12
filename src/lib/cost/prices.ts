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
  // The live MT teacher — Claude Sonnet 4.6 preferred (input units are
  // pre-weighted for prompt caching by the llm layer); gpt-4.1-mini fallback.
  'anthropic:teacher_input': { unitPrice: 0.003, unit: '1k_tokens' },
  'anthropic:teacher_output': { unitPrice: 0.015, unit: '1k_tokens' },
  'openai:teacher_input': { unitPrice: 0.0004, unit: '1k_tokens' },
  'openai:teacher_output': { unitPrice: 0.0016, unit: '1k_tokens' },
  // Conversation partner — Claude Haiku 4.5 preferred (latency-sensitive).
  'anthropic:conversation_input': { unitPrice: 0.001, unit: '1k_tokens' },
  'anthropic:conversation_output': { unitPrice: 0.005, unit: '1k_tokens' },
  'openai:conversation_input': { unitPrice: 0.0004, unit: '1k_tokens' },
  'openai:conversation_output': { unitPrice: 0.0016, unit: '1k_tokens' },
  // Runtime TTS, cached per line on disk. ElevenLabs primary (bake-off
  // winner; one voice everywhere), OpenAI fallback.
  'elevenlabs:tts_runtime': { unitPrice: 0.3, unit: '1k_chars' },
  'openai:tts_runtime': { unitPrice: 0.012, unit: '1k_chars' },
  // Progress digest: extracts taught/solid/shaky vocab from chat transcripts.
  'openai:progress_input': { unitPrice: 0.00015, unit: '1k_tokens' },
  'openai:progress_output': { unitPrice: 0.0006, unit: '1k_tokens' },
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
