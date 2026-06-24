import type { ContentItem } from '../content/types';
import type { MasteryState } from '../scheduler/scheduler';
import { isItemOfLanguage, wordOfItem } from '../progress/chat-items';
import { normalize, type LanguageCode } from '../matching';
import type { Lexeme } from './types';

/**
 * Pure selection of the Verbs page: turn the learner's mastery rows into the
 * list of verbs they've actually met, deduped to one entry per infinitive.
 * No POS/lemma exists in the data, so a cached classification (`lexeme`) is
 * joined in here. Reuses the chat-items bridge so deck items ("es-f-001") and
 * chat items ("chat:es:quiero") are treated uniformly.
 */

/** Loosened bar (owner 2026-06-23): any verb that has come up in the learner's
 * own lessons qualifies — strength 0 included — so a shaky verb is still a
 * reference. It's never a dictionary dump: we only ever read from mastery. */
export const MIN_VERB_STRENGTH = 0;

export interface VerbListEntry {
  lemma: string;
  glossEn: string;
  /** 0..5: strongest mastery signal across this lemma's surface forms. */
  familiarity: number;
  /** Most recent encounter (ISO), for recency sort. */
  lastSeenAt: string | null;
  /** The forms actually encountered, deduped (e.g. ["quiero", "quieres"]). */
  surfaces: string[];
}

function isoMillis(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0;
}

function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return isoMillis(a) >= isoMillis(b) ? a : b;
}

/**
 * Normalized surface forms the learner has encountered for a language, each
 * with its strongest mastery signal and most-recent timestamp (a surface can
 * arrive via both a deck item and a chat item — aggregate, don't double-count).
 */
export function encounteredSurfaces(
  mastery: readonly MasteryState[],
  packItems: readonly ContentItem[],
  lang: LanguageCode,
): Map<string, { strength: number; lastSeenAt: string | null }> {
  const map = new Map<string, { strength: number; lastSeenAt: string | null }>();
  for (const m of mastery) {
    if (!isItemOfLanguage(m.itemId, lang)) continue;
    const raw = wordOfItem(m.itemId, packItems);
    if (!raw) continue;
    const surface = normalize(raw, lang);
    if (!surface) continue;
    const prev = map.get(surface);
    map.set(surface, {
      strength: Math.max(m.strength, prev?.strength ?? 0),
      lastSeenAt: laterIso(prev?.lastSeenAt ?? null, m.lastSeenAt),
    });
  }
  return map;
}

/** Encountered surfaces not yet in the classification cache — the delta the
 * service sends to the (batched, cheap) classifier. */
export function unclassifiedSurfaces(
  mastery: readonly MasteryState[],
  packItems: readonly ContentItem[],
  lexemes: readonly Lexeme[],
  lang: LanguageCode,
): string[] {
  const known = new Set(lexemes.map((l) => l.surface));
  return [...encounteredSurfaces(mastery, packItems, lang).keys()].filter((s) => !known.has(s));
}

/**
 * The verb list: encountered surfaces → classified verbs → deduped by lemma,
 * sorted weakest-first (study aid) then most-recently-seen. Surfaces with no
 * classification yet, or classified as non-verbs, are dropped.
 */
export function selectVerbs(
  mastery: readonly MasteryState[],
  packItems: readonly ContentItem[],
  lexemes: readonly Lexeme[],
  lang: LanguageCode,
  opts?: { minStrength?: number },
): VerbListEntry[] {
  const minStrength = opts?.minStrength ?? MIN_VERB_STRENGTH;
  const surfaces = encounteredSurfaces(mastery, packItems, lang);
  const lexBySurface = new Map(lexemes.map((l) => [l.surface, l]));
  const byLemma = new Map<string, VerbListEntry>();

  for (const [surface, info] of surfaces) {
    if (info.strength < minStrength) continue;
    const lex = lexBySurface.get(surface);
    if (!lex || lex.pos !== 'verb') continue;
    const lemma = lex.lemma || surface;
    const cur = byLemma.get(lemma);
    if (!cur) {
      byLemma.set(lemma, {
        lemma,
        glossEn: lex.glossEn,
        familiarity: info.strength,
        lastSeenAt: info.lastSeenAt,
        surfaces: [surface],
      });
    } else {
      cur.familiarity = Math.max(cur.familiarity, info.strength);
      cur.lastSeenAt = laterIso(cur.lastSeenAt, info.lastSeenAt);
      if (!cur.glossEn && lex.glossEn) cur.glossEn = lex.glossEn;
      if (!cur.surfaces.includes(surface)) cur.surfaces.push(surface);
    }
  }

  return [...byLemma.values()].sort((a, b) => {
    if (a.familiarity !== b.familiarity) return a.familiarity - b.familiarity;
    return isoMillis(b.lastSeenAt) - isoMillis(a.lastSeenAt);
  });
}
