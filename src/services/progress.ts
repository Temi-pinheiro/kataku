import { allItems } from '../lib/content/types';
import { masteredItemIds, newMastery, recordOutcome } from '../lib/scheduler/scheduler';
import { isItemOfLanguage, resolveItemId, wordOfItem } from '../lib/progress/chat-items';
import { spend } from '../lib/cost/meter';
import { stripMarks } from '../lib/teacher-markup';
import { PACKS, type InstalledLanguage } from '../packs';
import { finishSession, getAllMastery, openDb, recordSpend, startSession, upsertMastery } from '../db';
import { getOpenAIKey } from './keys';
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

const MODEL = 'gpt-4o-mini';

interface Digest {
  taught: string[];
  solid: string[];
  shaky: string[];
}

export async function digestProgress(lang: InstalledLanguage, turns: ChatTurn[]): Promise<void> {
  try {
    const key = await getOpenAIKey();
    if (!key || turns.length === 0) return;
    const transcript = turns
      .map((t) => `${t.role === 'teacher' ? 'TEACHER' : 'LEARNER'}: ${stripMarks(t.text)}`)
      .join('\n')
      .slice(-6000);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `Extract the LEARNER's target-language vocabulary state from this lesson transcript window. Return JSON {"taught":[],"solid":[],"shaky":[]}: ` +
              `taught = words/short phrases the teacher introduced; solid = the learner produced them correctly at least once unaided (their answers arrive via speech recognition — judge phonetically, generously); ` +
              `shaky = the learner attempted but needed correction. Target language only, lowercase dictionary form, no English, max 40 entries total.`,
          },
          { role: 'user', content: transcript },
        ],
      }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    if (data.usage) {
      const now = new Date();
      await recordSpend(spend('openai:progress_input', data.usage.prompt_tokens / 1000, now)).catch(() => {});
      await recordSpend(spend('openai:progress_output', data.usage.completion_tokens / 1000, now)).catch(() => {});
    }
    const digest = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as Partial<Digest>;
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
  const packItems = allItems(PACKS[lang]);
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

/** The S1 whitelist: every word the learner actually owns (strength ≥ 2). */
export async function buildWhitelist(lang: InstalledLanguage, max = 90): Promise<string[]> {
  try {
    const mastery = await getAllMastery();
    const packItems = allItems(PACKS[lang]);
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
