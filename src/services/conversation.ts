import { chatComplete, type ChatTurn, type LlmResult } from './llm';
import type { InstalledLanguage } from '../packs';
import { LANGUAGE_NAMES } from '../packs';

/**
 * Conversation mode (stretch S1, pulled forward by the owner): free spoken
 * dialogue in the target language. v1 honors the S1 spirit — short partner
 * turns, one question at a time, recast-don't-interrupt corrections, ≤2 new
 * words introduced MT-style, spoken debrief — with the level constraint
 * expressed as "early protocol blocks only" rather than the DB mastery
 * whitelist (chat lessons don't feed mastery yet; noted follow-up).
 */


export interface Scenario {
  id: string;
  title: string;
  goal: string;
}

/** The three generic starters that ship with S1 (stretch-spec). */
export const SCENARIOS: Scenario[] = [
  { id: 'intro', title: 'Introducing yourself', goal: 'meet someone new: names, where you are from, a little small talk' },
  { id: 'today', title: 'Plans for today', goal: 'talk about what you both want and have to do today' },
  { id: 'yesterday', title: 'What you did yesterday', goal: 'swap simple stories about yesterday' },
];

export type Mood = 'gentle' | 'normal';

const LEVEL: Record<InstalledLanguage, string> = {
  id: 'Assume only early-Foundation Indonesian: saya/kamu/dia, mau/bisa/harus/suka, tidak/belum, common verbs (pergi, makan, minum, beli, lihat, punya, datang, pulang), time words (sudah/akan/sekarang/nanti/besok/kemarin), connectors (dan/tapi/karena/kalau), question words, everyday loanwords (kopi, hotel, taksi, restoran).',
  es: 'Assume only crash-course Spanish: es/está, cognates, quiero/puedo/tengo que/voy a/necesito/me gustaría + infinitives, no/también/pero/porque, question words, time and place anchors (hoy, mañana, ahora, aquí), tengo/hay.',
  fr: "Assume only early-protocol French: c'est/ce n'est pas, cognates, je voudrais/je veux/je peux/je dois/je vais + infinitives, ne…pas, est-ce que + question words, pour moi/avec/mais/parce que, time anchors (maintenant, aujourd'hui), vous forms and politeness.",
};

function systemPrompt(lang: InstalledLanguage, scenario: Scenario, mood: Mood, whitelist: string[]): string {
  const name = LANGUAGE_NAMES[lang];
  const vocab =
    whitelist.length >= 15
      ? `The learner's known vocabulary (stay inside it apart from the new-word allowance): ${whitelist.join(', ')}.`
      : LEVEL[lang];
  return `You are a friendly native ${name} speaker having a real spoken conversation with a beginner. Scenario: ${scenario.goal}.

Hard rules:
- Speak ${name} ONLY. The single exception: when you introduce a new word (at most 2 per conversation), gloss it once Michel Thomas-style inline ("pasar — that's the market — pasar"), then keep going in ${name}.
- ${vocab}
- Replies are at most 2 short sentences, then at most ONE question. Natural register, like a real person, not a textbook.
- The learner speaks via speech recognition; transcripts arrive mangled. Interpret generously by sound.
- Correction policy: RECAST, never interrupt or lecture. If they say something wrong, reply naturally with the corrected form embedded in your answer.
- ${mood === 'gentle' ? 'Gentle mood: you carry the conversation; short answers from the learner are fine; offer either/or choices when they stall.' : 'Normal mood: expect fuller sentences; give the learner room to construct.'}
- If the learner is silent or stuck twice, ask a simpler either/or question.
- Plain text only — it will be spoken aloud.`;
}

export type PartnerResult = LlmResult;

function callModel(system: string, history: ChatTurn[], capUsd: number, maxTokens: number): Promise<PartnerResult> {
  return chatComplete({
    feature: 'conversation',
    system,
    turns: history,
    openingUserMsg: 'Start the conversation with your opening line.',
    maxTokens,
    capUsd,
  });
}

export function partnerReply(
  lang: InstalledLanguage,
  scenario: Scenario,
  mood: Mood,
  history: ChatTurn[],
  capUsd: number,
  whitelist: string[] = [],
): Promise<PartnerResult> {
  return callModel(systemPrompt(lang, scenario, mood, whitelist), history, capUsd, 160);
}

export function debrief(lang: InstalledLanguage, history: ChatTurn[], capUsd: number): Promise<PartnerResult> {
  const system = `The conversation below just ended. You are the learner's ${LANGUAGE_NAMES[lang]} teacher. Give the debrief, in English, under 120 words, plain text (it will be spoken aloud): two or three patterns worth tightening, each demonstrated with the corrected ${LANGUAGE_NAMES[lang]} form; then one genuine, specific compliment about something they actually did well — only if earned. No bullet symbols.`;
  return callModel(system, [...history, { role: 'learner', text: '(The conversation has ended. Give my debrief now.)' }], capUsd, 250);
}
