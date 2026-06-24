import { allItems } from '../lib/content/types';
import { spend, isOverCap } from '../lib/cost/meter';
import { extractJson } from '../lib/extract-json';
import { parseClassifications, parseVerbEntry, type Lexeme, type VerbEntry } from '../lib/verbs/types';
import { classifySystem, detailSystem, detailUser } from '../lib/verbs/prompt';
import { encounteredSurfaces, selectVerbs, type VerbListEntry } from '../lib/verbs/select';
import { LANGUAGE_NAMES_EN, packFor, type InstalledLanguage } from '../packs';
import {
  getAllMastery,
  getLexemes,
  getVerbEntry,
  putVerbEntry,
  recordSpend,
  spendEvents,
  upsertLexemes,
} from '../db';
import { getAnthropicKey, getOpenAIKey } from './keys';
import { getRemoteVerb, putRemoteVerb } from './verb-remote';
import { VERB_SEED } from '../generated/verb-seed';

/**
 * The Verbs reference brain. Two LLM passes, both cost-metered and aggressively
 * cached:
 *  - classifyLexemes: which encountered surfaces are verbs + their infinitive.
 *    Cheap gpt-4o-mini, batched, run only on the delta of new surfaces, and we
 *    store a row for EVERY asked surface (unknowns as 'other') so nothing is
 *    ever re-classified.
 *  - getOrGenerateVerbEntry: the detail page. Lookup chain local → bundled seed
 *    → remote shared cache (Phase C, inert) → generate. A verb is generated, and
 *    paid for, at most once per device; generation prefers Claude Sonnet for
 *    grammar accuracy (it's one-time), gpt-4.1-mini fallback.
 *
 * Degrades gracefully everywhere (hard rule #4): no key / over cap / offline
 * never blocks — the screen shows what's cached and a quiet notice.
 */

const CLASSIFY_MODELS = { anthropic: 'claude-haiku-4-5', openai: 'gpt-4o-mini' } as const;
const DETAIL_MODELS = { anthropic: 'claude-sonnet-4-6', openai: 'gpt-4.1-mini' } as const;

export type VerbDetailResult =
  | { kind: 'ok'; entry: VerbEntry; source: 'local' | 'seed' | 'remote' | 'generated' }
  | { kind: 'no_key' }
  | { kind: 'capped'; capUsd: number }
  | { kind: 'error'; message: string };

/** Why the verb list is what it is — drives an honest empty state. */
export type VerbListReason = 'ok' | 'empty_no_mastery' | 'empty_no_verbs' | 'needs_key' | 'capped';

export interface VerbListResult {
  verbs: VerbListEntry[];
  reason: VerbListReason;
  /** How many distinct words the learner has used in this language (any). */
  encountered: number;
}

// ---- helpers ----

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function overCap(capUsd: number): Promise<boolean> {
  try {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    return isOverCap(await spendEvents(monthStart.toISOString()), capUsd, new Date());
  } catch {
    return false; // a metering read failure must not block the reference
  }
}

// ---- classification ----

/**
 * One classification call — Anthropic Haiku first, OpenAI fallback, metered.
 * Returns null on a call failure (so the batch is retried next time, not
 * mislabeled), or the parsed classifications on success (possibly empty).
 */
async function classifyCall(batch: readonly string[], langName: string): Promise<Omit<Lexeme, 'language'>[] | null> {
  const now = new Date();
  try {
    const anthropicKey = await getAnthropicKey();
    if (anthropicKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: CLASSIFY_MODELS.anthropic,
          max_tokens: 2000,
          system: classifySystem(langName),
          messages: [{ role: 'user', content: `${JSON.stringify(batch)}\n\nRespond with ONLY the JSON object.` }],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        content: { type: string; text?: string }[];
        usage?: { input_tokens: number; output_tokens: number };
      };
      if (data.usage) {
        await recordSpend(spend('anthropic:verb_classify_input', data.usage.input_tokens / 1000, now)).catch(() => {});
        await recordSpend(spend('anthropic:verb_classify_output', data.usage.output_tokens / 1000, now)).catch(() => {});
      }
      const text = (data.content ?? []).filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n');
      return parseClassifications(extractJson(text));
    }
    const openaiKey = await getOpenAIKey();
    if (openaiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: CLASSIFY_MODELS.openai,
          temperature: 0,
          max_tokens: 1800,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: classifySystem(langName) },
            { role: 'user', content: JSON.stringify(batch) },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens: number; completion_tokens: number };
      };
      if (data.usage) {
        await recordSpend(spend('openai:verb_classify_input', data.usage.prompt_tokens / 1000, now)).catch(() => {});
        await recordSpend(spend('openai:verb_classify_output', data.usage.completion_tokens / 1000, now)).catch(() => {});
      }
      return parseClassifications(JSON.parse(data.choices?.[0]?.message?.content ?? '{}'));
    }
  } catch (e) {
    console.warn('verb classify call failed', e);
  }
  return null;
}

/** Classify + cache a batch of surfaces. Idempotent; safe to call with the delta. */
export async function classifyLexemes(lang: InstalledLanguage, surfaces: readonly string[]): Promise<void> {
  if (surfaces.length === 0) return;
  if (!(await getAnthropicKey()) && !(await getOpenAIKey())) return;
  const langName = LANGUAGE_NAMES_EN[lang];
  const now = new Date();
  for (const batch of chunk(surfaces, 50)) {
    const parsed = await classifyCall(batch, langName);
    if (parsed === null) continue; // transient failure — retry on the next open
    const bySurface = new Map(parsed.map((p) => [p.surface, p]));
    // Store a row for EVERY surface we asked about — unknowns as 'other' — so we
    // never pay to re-classify the same word.
    const rows = batch.map((s) => bySurface.get(s) ?? { surface: s, lemma: s, pos: 'other' as const, glossEn: '' });
    await upsertLexemes(lang, rows, now);
  }
}

// ---- detail generation ----

async function generateAnthropic(
  key: string,
  langName: string,
  lemma: string,
  glossEn: string,
): Promise<VerbDetailResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: DETAIL_MODELS.anthropic,
        max_tokens: 3500,
        system: detailSystem(langName),
        messages: [{ role: 'user', content: detailUser(langName, lemma, glossEn) }],
      }),
    });
    if (!res.ok) return { kind: 'error', message: `verb page unavailable (anthropic ${res.status})` };
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    if (data.usage) {
      const now = new Date();
      await recordSpend(spend('anthropic:verb_detail_input', data.usage.input_tokens / 1000, now)).catch(() => {});
      await recordSpend(spend('anthropic:verb_detail_output', data.usage.output_tokens / 1000, now)).catch(() => {});
    }
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text)
      .join('\n');
    const entry = parseVerbEntry(extractJson(text), lemma, glossEn);
    return entry ? { kind: 'ok', entry, source: 'generated' } : { kind: 'error', message: 'could not read the verb page' };
  } catch (e) {
    return { kind: 'error', message: (e as Error)?.message ?? 'network error' };
  }
}

async function generateOpenAI(
  key: string,
  langName: string,
  lemma: string,
  glossEn: string,
): Promise<VerbDetailResult> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DETAIL_MODELS.openai,
        temperature: 0.2,
        max_tokens: 3500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: detailSystem(langName) },
          { role: 'user', content: detailUser(langName, lemma, glossEn) },
        ],
      }),
    });
    if (!res.ok) return { kind: 'error', message: `verb page unavailable (openai ${res.status})` };
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    if (data.usage) {
      const now = new Date();
      await recordSpend(spend('openai:verb_detail_input', data.usage.prompt_tokens / 1000, now)).catch(() => {});
      await recordSpend(spend('openai:verb_detail_output', data.usage.completion_tokens / 1000, now)).catch(() => {});
    }
    const entry = parseVerbEntry(extractJson(data.choices?.[0]?.message?.content ?? ''), lemma, glossEn);
    return entry ? { kind: 'ok', entry, source: 'generated' } : { kind: 'error', message: 'could not read the verb page' };
  } catch (e) {
    return { kind: 'error', message: (e as Error)?.message ?? 'network error' };
  }
}

/** Raw generation (no cache, no cap) — used by the chain and the seed script. */
export async function generateVerbEntry(
  lang: InstalledLanguage,
  lemma: string,
  glossEn: string,
): Promise<VerbDetailResult> {
  const langName = LANGUAGE_NAMES_EN[lang];
  const anthropicKey = await getAnthropicKey();
  if (anthropicKey) return generateAnthropic(anthropicKey, langName, lemma, glossEn);
  const openaiKey = await getOpenAIKey();
  if (openaiKey) return generateOpenAI(openaiKey, langName, lemma, glossEn);
  return { kind: 'no_key' };
}

/**
 * The detail page for one verb: local cache → bundled seed → remote shared
 * cache → generate (cost-gated). On a fresh generation, write through to the
 * local cache and best-effort push to the shared cache so the next device is free.
 */
export async function getOrGenerateVerbEntry(
  lang: InstalledLanguage,
  lemma: string,
  glossEn: string,
  capUsd: number,
): Promise<VerbDetailResult> {
  const local = await getVerbEntry(lang, lemma);
  if (local) return { kind: 'ok', entry: local, source: 'local' };

  const seeded = VERB_SEED[`${lang}:${lemma}`];
  if (seeded) {
    await putVerbEntry(lang, lemma, seeded, 'seed', new Date()).catch(() => {});
    return { kind: 'ok', entry: seeded, source: 'seed' };
  }

  const remote = await getRemoteVerb(lang, lemma);
  if (remote) {
    await putVerbEntry(lang, lemma, remote, 'remote', new Date()).catch(() => {});
    return { kind: 'ok', entry: remote, source: 'remote' };
  }

  if (await overCap(capUsd)) return { kind: 'capped', capUsd };

  const result = await generateVerbEntry(lang, lemma, glossEn);
  if (result.kind === 'ok') {
    await putVerbEntry(lang, lemma, result.entry, DETAIL_MODELS.anthropic, new Date()).catch(() => {});
    void putRemoteVerb(lang, lemma, result.entry); // fire-and-forget write-back
  }
  return result;
}

/**
 * The Verbs list for a language: classify any newly-encountered surfaces (if a
 * key is available and we're under cap), then select the deduped verb list from
 * the cached classifications. Cheap and mostly cache-served after first run.
 * Returns a reason so the empty state can be honest about WHY it's empty —
 * verb detection (and the chat digest that records mastery) both need OpenAI.
 */
export async function loadVerbList(lang: InstalledLanguage, capUsd: number): Promise<VerbListResult> {
  const mastery = await getAllMastery();
  const pack = packFor(lang);
  const packItems = pack ? allItems(pack) : [];
  let lexemes = await getLexemes(lang);

  const surfaces = encounteredSurfaces(mastery, packItems, lang);
  const encountered = surfaces.size;
  const known = new Set(lexemes.map((l) => l.surface));
  const pending = [...surfaces.keys()].filter((s) => !known.has(s));

  const hasKey = Boolean((await getAnthropicKey()) || (await getOpenAIKey()));
  const capped = pending.length > 0 && (await overCap(capUsd));

  if (pending.length > 0 && hasKey && !capped) {
    await classifyLexemes(lang, pending);
    lexemes = await getLexemes(lang);
  }

  const verbs = selectVerbs(mastery, packItems, lexemes, lang);
  if (verbs.length > 0) return { verbs, reason: 'ok', encountered };

  // Empty — say why, most-actionable cause first.
  let reason: VerbListReason;
  if (!hasKey && (encountered === 0 || pending.length > 0)) reason = 'needs_key';
  else if (encountered === 0) reason = 'empty_no_mastery';
  else if (capped) reason = 'capped';
  else reason = 'empty_no_verbs';
  return { verbs, reason, encountered };
}
