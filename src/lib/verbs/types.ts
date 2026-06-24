/**
 * Verb-reference types + defensive validators for the LLM-generated payloads.
 * Pure (no react-native / node imports) so it's unit-tested with vitest and
 * shared by the db cache, the service, and the screen.
 *
 * Two LLM passes feed this: a cheap classification (surface → lemma + part of
 * speech) and a richer per-lemma detail page. Both are cached forever, so the
 * validators must be strict — a malformed page must never poison the cache.
 */

/** Bump when the VerbEntry shape changes; cached rows on an older version are
 * ignored and regenerated (see db getVerbEntry). */
export const VERB_SCHEMA_VERSION = 1;

export type PartOfSpeech = 'verb' | 'noun' | 'adjective' | 'adverb' | 'phrase' | 'other';

/** A classified surface form (one row of the `lexeme` cache). */
export interface Lexeme {
  language: string;
  /** Normalized surface as stored in mastery (e.g. "quiero", "makan"). */
  surface: string;
  /** Dictionary / infinitive form (e.g. "querer"). */
  lemma: string;
  pos: PartOfSpeech;
  glossEn: string;
}

/** One conjugation/aspect grid. Language-aware: Romance gets person×tense
 * grids, Indonesian gets affix/aspect tables — the renderer is agnostic. */
export interface VerbTable {
  /** e.g. "Present", "Preterite", "Affixed forms". */
  label: string;
  /** Optional header row, e.g. ["", "singular", "plural"]. */
  columns?: string[];
  /** Each row is a list of cells (target forms, optionally a gloss cell). */
  rows: string[][];
}

export interface VerbExample {
  /** Original example sentence in the target language (never copied from a course). */
  target: string;
  en: string;
}

/** The cached detail page for one verb. */
export interface VerbEntry {
  lemma: string;
  glossEn: string;
  /** true = regular, false = irregular, null = notion N/A (e.g. Indonesian). */
  regular: boolean | null;
  tables: VerbTable[];
  examples: VerbExample[];
  notes: string[];
}

// ---- validators (LLM output is untrusted) ----

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter(Boolean);
}

/** Lenient POS folding — the classifier is told to use exact tokens, but be
 * forgiving of "v"/"verb (transitive)"/etc. so a stray label isn't lost. */
export function normalizePos(raw: unknown): PartOfSpeech {
  const s = str(raw).toLowerCase();
  if (s.startsWith('v')) return 'verb';
  if (s.startsWith('n')) return 'noun';
  if (s.startsWith('adj')) return 'adjective';
  if (s.startsWith('adv')) return 'adverb';
  if (s.startsWith('phr')) return 'phrase';
  return 'other';
}

/** Parse one classification call: `{ items: [{surface, lemma, pos, gloss}] }`. */
export function parseClassifications(raw: unknown): Omit<Lexeme, 'language'>[] {
  const obj = raw as { items?: unknown };
  const items = Array.isArray(obj?.items) ? obj.items : Array.isArray(raw) ? (raw as unknown[]) : [];
  const out: Omit<Lexeme, 'language'>[] = [];
  for (const it of items) {
    const r = it as Record<string, unknown>;
    const surface = str(r?.surface).toLowerCase();
    const lemma = str(r?.lemma).toLowerCase() || surface;
    if (!surface) continue;
    out.push({ surface, lemma, pos: normalizePos(r?.pos), glossEn: str(r?.gloss ?? r?.glossEn ?? r?.gloss_en) });
  }
  return out;
}

function parseTable(raw: unknown): VerbTable | null {
  const r = raw as Record<string, unknown>;
  const label = str(r?.label);
  const rowsRaw = Array.isArray(r?.rows) ? r.rows : [];
  const rows = rowsRaw.map((row) => strArray(row)).filter((row) => row.length > 0);
  if (!label || rows.length === 0) return null;
  const columns = Array.isArray(r?.columns) ? strArray(r.columns) : undefined;
  return columns && columns.length > 0 ? { label, columns, rows } : { label, rows };
}

function parseExample(raw: unknown): VerbExample | null {
  const r = raw as Record<string, unknown>;
  const target = str(r?.target);
  const en = str(r?.en ?? r?.english);
  return target ? { target, en } : null;
}

/**
 * Validate an LLM-generated verb page. Returns null if it's unusable (no
 * tables AND no examples — nothing worth caching). `lemma`/`gloss` fall back
 * to the values we asked for so a thin-but-valid page still renders.
 */
export function parseVerbEntry(raw: unknown, lemma: string, glossEn: string): VerbEntry | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const tables = (Array.isArray(r.tables) ? r.tables : [])
    .map(parseTable)
    .filter((t): t is VerbTable => t !== null);
  const examples = (Array.isArray(r.examples) ? r.examples : [])
    .map(parseExample)
    .filter((e): e is VerbExample => e !== null);
  if (tables.length === 0 && examples.length === 0) return null;
  const regular = typeof r.regular === 'boolean' ? r.regular : null;
  return {
    lemma: str(r.lemma).toLowerCase() || lemma,
    glossEn: str(r.glossEn ?? r.gloss ?? r.gloss_en) || glossEn,
    regular,
    tables,
    examples,
    notes: strArray(r.notes),
  };
}
