import type { LanguageCode } from '../matching';

/** Content schema, plan §5.1. Content is data, not code; the app is a player. */

export type ItemType = 'block' | 'pattern' | 'usage_note';

export interface ContentItem {
  id: string;
  type: ItemType;
  concept_en: string;
  target_text: string;
  /** Pinyin for zh; null elsewhere. */
  romanization: string | null;
  teach_script: string;
  audio: { teach: string };
  /** S3 schema addition; defaults to neutral. */
  register?: 'neutral' | 'casual' | 'formal';
}

export interface ContentPrompt {
  id: string;
  cue_en: string;
  /** expected[0] is canonical; the rest are accepted variants. */
  expected: string[];
  /** Item ids this prompt exercises. */
  components: string[];
  difficulty: number;
  decompose_script?: string;
  audio: {
    cue: string;
    answer: string;
    answer_slow: string;
    /** Optional rendered decompose line; device TTS speaks the script if absent. */
    decompose?: string;
  };
}

export interface Lesson {
  index: number;
  items: ContentItem[];
  prompts: ContentPrompt[];
}

export interface Unit {
  index: number;
  title: string;
  lessons: Lesson[];
}

/**
 * Grammar template for the speakable-sentences counter (plan §8). Count for
 * a template = product over required slots of mastered-filler counts
 * (+1 per optional slot for the "omitted" case), zero if any required slot
 * has no mastered filler.
 */
export interface SentenceTemplate {
  id: string;
  /** Human-readable shape, e.g. "[subject] [modal] [verb] [object] [time]". */
  shape: string;
  slots: TemplateSlot[];
}

export interface TemplateSlot {
  name: string;
  /** Item ids that can fill this slot. */
  fillers: string[];
  optional?: boolean;
}

export interface CoursePack {
  language: LanguageCode;
  phase: 'foundation' | 'builder';
  /** Bumped when content changes; the app reloads items/prompts on mismatch. */
  version: number;
  units: Unit[];
  templates: SentenceTemplate[];
  /**
   * Per-language system lines rendered once per pack: the pass confirm,
   * the near-miss "Almost — listen:", session open/close lines, etc.
   */
  system_lines: Record<string, { text: string; audio: string }>;
}

export function allItems(pack: CoursePack): ContentItem[] {
  return pack.units.flatMap((u) => u.lessons.flatMap((l) => l.items));
}

export function allPrompts(pack: CoursePack): ContentPrompt[] {
  return pack.units.flatMap((u) => u.lessons.flatMap((l) => l.prompts));
}

export function allLessons(pack: CoursePack): { unit: Unit; lesson: Lesson }[] {
  return pack.units.flatMap((u) => u.lessons.map((l) => ({ unit: u, lesson: l })));
}
