export type LanguageCode = 'id' | 'fr' | 'it' | 'es';

/** Every supported language is whitespace-delimited; kept as a map so the
 * tokenizer stays data-driven if a non-space-delimited language ever returns. */
const SPACE_DELIMITED: Record<LanguageCode, boolean> = {
  id: true,
  fr: true,
  it: true,
  es: true,
};

/**
 * Canonical normalization shared by the app's evaluator and the content
 * validator (plan §3.3): lowercase, strip punctuation/symbols, collapse
 * whitespace, keep diacritics. Word-internal apostrophes survive ("c'est"
 * stays one token — iOS French STT produces them reliably); curly ’ folds
 * to straight '. Hyphens become token breaks.
 */
export function normalize(text: string, lang: LanguageCode): string {
  const stripped = text
    .toLowerCase()
    .replace(/[’]/gu, "'")
    .replace(/[^\p{L}\p{M}\p{N}\s']/gu, ' ')
    .replace(/'(?!\p{L})|(?<!\p{L})'/gu, ' '); // keep ' only between letters
  if (!SPACE_DELIMITED[lang]) {
    return stripped.replace(/\s+/gu, '');
  }
  return stripped.replace(/\s+/gu, ' ').trim();
}

/**
 * Units for token-level edit distance: words for space-delimited languages.
 * Input must already be normalized.
 */
export function tokenize(normalized: string, lang: LanguageCode): string[] {
  if (!SPACE_DELIMITED[lang]) {
    return Array.from(normalized);
  }
  return normalized.length === 0 ? [] : normalized.split(' ');
}
