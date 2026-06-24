import { allItems } from '../lib/content/types';
import { masteredItemIds, newMastery, recordOutcome } from '../lib/scheduler/scheduler';
import { isItemOfLanguage, resolveItemId, wordOfItem } from '../lib/progress/chat-items';
import { spend, isOverCap } from '../lib/cost/meter';
import { stripMarks } from '../lib/teacher-markup';
import { INSTALLED_LANGUAGES, packFor, type InstalledLanguage } from '../packs';
import {
  finishSession,
  getAllMastery,
  getSettingsByPrefix,
  openDb,
  recordSpend,
  spendEvents,
  startSession,
  upsertMastery,
} from '../db';
import { extractJson } from '../lib/extract-json';
import { getAnthropicKey, getOpenAIKey } from './keys';
import type { ChatTurn } from './teacher';

/**
 * Progress for the chat modes: a cheap digest call extracts the learner's
 * vocabulary state from a transcript window and feeds the EXISTING
 * scheduler/mastery machinery — words matching pack items flow into the
 * speakable templates and review natively; the rest become chat:* items
 * that still count and power the S1 conversation whitelist (stretch
 * contract #3, now real). Best-effort everywhere: progress bookkeeping
 * must never block or break a lesson.
 */

// Anthropic-first (Haiku 4.5 — the same key that runs the teacher), OpenAI fallback.
const DIGEST_MODELS = { anthropic: 'claude-haiku-4-5', openai: 'gpt-4o-mini' } as const;

const DIGEST_SYSTEM =
  `Extract the LEARNER's target-language vocabulary state from this lesson transcript window. Return JSON {"taught":[],"solid":[],"shaky":[]}: ` +
  `taught = words/short phrases the teacher introduced; solid = the learner produced them correctly at least once unaided (their answers arrive via speech recognition — judge phonetically, generously); ` +
  `shaky = the learner attempted but needed correction. Target language only, lowercase dictionary form, no English, max 40 entries total.`;

interface Digest {
  taught: string[];
  solid: string[];
  shaky: string[];
}

/** One digest call — Anthropic first, OpenAI fallback, metered. null on failure. */
async function digestCall(transcript: string): Promise<Partial<Digest> | null> {
  const now = new Date();
  const anthropicKey = await getAnthropicKey();
  if (anthropicKey) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: DIGEST_MODELS.anthropic,
        max_tokens: 400,
        system: DIGEST_SYSTEM,
        messages: [{ role: 'user', content: `${transcript}\n\nRespond with ONLY the JSON object.` }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    if (data.usage) {
      await recordSpend(spend('anthropic:progress_input', data.usage.input_tokens / 1000, now)).catch(() => {});
      await recordSpend(spend('anthropic:progress_output', data.usage.output_tokens / 1000, now)).catch(() => {});
    }
    const text = (data.content ?? []).filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n');
    return extractJson(text) as Partial<Digest>;
  }
  const openaiKey = await getOpenAIKey();
  if (openaiKey) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DIGEST_MODELS.openai,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DIGEST_SYSTEM },
          { role: 'user', content: transcript },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    if (data.usage) {
      await recordSpend(spend('openai:progress_input', data.usage.prompt_tokens / 1000, now)).catch(() => {});
      await recordSpend(spend('openai:progress_output', data.usage.completion_tokens / 1000, now)).catch(() => {});
    }
    return JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as Partial<Digest>;
  }
  return null;
}

export async function digestProgress(lang: InstalledLanguage, turns: ChatTurn[]): Promise<void> {
  try {
    if (turns.length === 0) return;
    if (!(await getAnthropicKey()) && !(await getOpenAIKey())) return;
    const transcript = turns
      .map((t) => `${t.role === 'teacher' ? 'TEACHER' : 'LEARNER'}: ${stripMarks(t.text)}`)
      .join('\n')
      .slice(-6000);

    const digest = await digestCall(transcript);
    if (!digest) return;
    await applyDigest(lang, {
      taught: digest.taught ?? [],
      solid: digest.solid ?? [],
      shaky: digest.shaky ?? [],
    });
  } catch (e) {
    console.warn('progress digest skipped', e);
  }
}

async function applyDigest(lang: InstalledLanguage, digest: Digest): Promise<void> {
  const pack = packFor(lang);
  const packItems = pack ? allItems(pack) : []; // packless: chat:<lang>:<word> ids
  const mastery = new Map((await getAllMastery()).map((m) => [m.itemId, m]));
  const now = new Date();

  // Strongest signal wins when a word appears in several buckets.
  const outcomes = new Map<string, 'pass' | 'near' | 'miss'>();
  for (const word of digest.taught) outcomes.set(resolveItemId(lang, word, packItems), 'near');
  for (const word of digest.shaky) outcomes.set(resolveItemId(lang, word, packItems), 'miss');
  for (const word of digest.solid) outcomes.set(resolveItemId(lang, word, packItems), 'pass');

  for (const [itemId, outcome] of outcomes) {
    if (!itemId.replace(/^chat:[a-z]{2}:/, '').trim()) continue;
    const prev = mastery.get(itemId) ?? newMastery(itemId, now);
    await upsertMastery(recordOutcome(prev, outcome, now)).catch(() => {});
  }
}

export interface RecoverResult {
  /** Saved module histories re-scanned. */
  histories: number;
  /** Transcript windows digested. */
  windows: number;
  /** Stopped early because the monthly spend cap was hit. */
  capped: boolean;
}

async function overCap(capUsd: number): Promise<boolean> {
  try {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    return isOverCap(await spendEvents(monthStart.toISOString()), capUsd, new Date());
  } catch {
    return false;
  }
}

/**
 * One-time recovery: re-digest the learner's SAVED teacher-chat history into
 * mastery, so progress + the verbs page reflect past lessons the old OpenAI-only
 * digest silently dropped. History lives in settings (`teacher_chat.<lang>.<mod>`)
 * and survives app updates. Digests in turn-windows so long histories aren't
 * truncated to just the tail. Idempotent (mastery upserts converge) and
 * cost-gated — stops cleanly if the spend cap is reached.
 */
export async function recoverPastVocabulary(capUsd: number): Promise<RecoverResult> {
  const result: RecoverResult = { histories: 0, windows: 0, capped: false };
  if (await overCap(capUsd)) {
    result.capped = true;
    return result;
  }
  for (const lang of INSTALLED_LANGUAGES) {
    const rows = await getSettingsByPrefix(`teacher_chat.${lang}.`);
    for (const { key, value } of rows) {
      if (key.endsWith('.digested') || key.endsWith('.draft')) continue; // sibling keys, not history
      let history: ChatTurn[];
      try {
        history = JSON.parse(value) as ChatTurn[];
      } catch {
        continue;
      }
      if (!Array.isArray(history) || history.length === 0) continue;
      result.histories++;
      for (let i = 0; i < history.length; i += 20) {
        if (await overCap(capUsd)) {
          result.capped = true;
          return result;
        }
        const transcript = history
          .slice(i, i + 20)
          .map((t) => `${t.role === 'teacher' ? 'TEACHER' : 'LEARNER'}: ${stripMarks(t.text)}`)
          .join('\n')
          .slice(-6000);
        const digest = await digestCall(transcript);
        if (digest) {
          await applyDigest(lang, {
            taught: digest.taught ?? [],
            solid: digest.solid ?? [],
            shaky: digest.shaky ?? [],
          });
        }
        result.windows++;
      }
    }
  }
  return result;
}

/** The S1 whitelist: every word the learner actually owns (strength ≥ 2). */
export async function buildWhitelist(lang: InstalledLanguage, max = 90): Promise<string[]> {
  try {
    const mastery = await getAllMastery();
    const pack = packFor(lang);
    const packItems = pack ? allItems(pack) : [];
    const ids = masteredItemIds(mastery, 2).filter((id) => isItemOfLanguage(id, lang));
    const words = ids
      .map((id) => wordOfItem(id, packItems))
      .filter((w): w is string => Boolean(w));
    return [...new Set(words)].slice(0, max);
  } catch {
    return [];
  }
}

/**
 * Substantial chat practice marks the day (plan §3.2): one completed
 * session row per qualifying sitting; at most one core-completed row is
 * needed for Home's "done today", extras are harmless history.
 */
export async function markPracticeSession(
  lang: InstalledLanguage,
  learnerTurns: number,
  startedAtIso: string,
): Promise<void> {
  try {
    const db = await openDb();
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM session WHERE language = ? AND core_completed = 1 AND started_at >= ?',
      lang,
      today,
    );
    if ((row?.n ?? 0) > 0) return; // the day is already marked
    const id = await startSession(lang, new Date(startedAtIso));
    await finishSession(id, { newItems: 0, promptsDone: learnerTurns, coreCompleted: true }, new Date());
  } catch (e) {
    console.warn('practice session not recorded', e);
  }
}
