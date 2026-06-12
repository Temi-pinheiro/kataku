import { spend, monthToDateUsd, isOverCap } from '../lib/cost/meter';
import { recordSpend, spendEvents } from '../db';
import { getOpenAIKey } from './keys';
import { teacherSystemPrompt, TEACHER_OPENING_USER_MSG } from './teacher-prompt';
import type { InstalledLanguage } from '../packs';

/**
 * The live Michel Thomas teacher (owner pivot 2026-06-11): lessons are a
 * conversation driven by an LLM following the owner's instruction spec.
 * Every call is cost-metered; the soft cap stops calls gracefully.
 */

// gpt-4o-mini failed the protocol's discipline on device (false
// corrections, prompts using untaught words) — the teacher needs the
// stronger mini. Digest/extraction stays on 4o-mini (easy task).
const MODEL = 'gpt-4.1-mini';
const MAX_HISTORY_TURNS = 40; // the spec keeps teacher turns short; this is plenty of context

export interface ChatTurn {
  role: 'teacher' | 'learner';
  text: string;
}

export type TeacherResult =
  | { kind: 'ok'; text: string }
  | { kind: 'no_key' }
  | { kind: 'capped'; capUsd: number }
  | { kind: 'error'; message: string };

export async function teacherReply(
  lang: InstalledLanguage,
  history: ChatTurn[],
  capUsd: number,
): Promise<TeacherResult> {
  const key = await getOpenAIKey();
  if (!key) return { kind: 'no_key' };

  // Soft cap (plan §4.4): at the cap, paid features switch off with a
  // notice, never silently and never blocking what's already on screen.
  try {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const events = await spendEvents(monthStart.toISOString());
    if (isOverCap(events, capUsd, new Date())) {
      return { kind: 'capped', capUsd };
    }
  } catch {
    // metering read failure must not block the lesson
  }

  const messages = [
    { role: 'system' as const, content: teacherSystemPrompt(lang) },
    ...(history.length === 0
      ? [{ role: 'user' as const, content: TEACHER_OPENING_USER_MSG }]
      : history.slice(-MAX_HISTORY_TURNS).map((t) => ({
          role: t.role === 'teacher' ? ('assistant' as const) : ('user' as const),
          content: t.text,
        }))),
  ];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: 500 }),
    });
    if (!res.ok) {
      return { kind: 'error', message: `teacher unavailable (${res.status})` };
    }
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { kind: 'error', message: 'teacher gave an empty reply' };

    if (data.usage) {
      const now = new Date();
      await recordSpend(spend('openai:teacher_input', data.usage.prompt_tokens / 1000, now)).catch(() => {});
      await recordSpend(spend('openai:teacher_output', data.usage.completion_tokens / 1000, now)).catch(() => {});
    }
    return { kind: 'ok', text };
  } catch (e) {
    return { kind: 'error', message: (e as Error)?.message ?? 'network error' };
  }
}

export async function monthSpendUsd(): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  try {
    return monthToDateUsd(await spendEvents(monthStart.toISOString()), new Date());
  } catch {
    return 0;
  }
}
