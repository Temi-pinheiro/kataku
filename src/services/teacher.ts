import { monthToDateUsd } from '../lib/cost/meter';
import { spendEvents } from '../db';
import { chatComplete, type ChatTurn, type LlmResult } from './llm';
import { teacherSystemPrompt, TEACHER_OPENING_USER_MSG } from './teacher-prompt';
import type { InstalledLanguage } from '../packs';

/**
 * The live Michel Thomas teacher: a conversation driven by an LLM following
 * the owner's protocol files. Provider/model selection, prompt caching,
 * metering, and the soft cap live in services/llm.ts (Anthropic preferred).
 */

const MAX_HISTORY_TURNS = 40; // the protocols keep teacher turns short; plenty of context

export type { ChatTurn };
export type TeacherResult = LlmResult;

export function teacherReply(
  lang: InstalledLanguage,
  history: ChatTurn[],
  capUsd: number,
): Promise<TeacherResult> {
  return chatComplete({
    feature: 'teacher',
    system: teacherSystemPrompt(lang),
    turns: history.slice(-MAX_HISTORY_TURNS),
    openingUserMsg: TEACHER_OPENING_USER_MSG,
    maxTokens: 500,
    capUsd,
  });
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
