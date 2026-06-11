export type LanguageCode = 'id' | 'zh' | 'fr' | 'it' | 'es';

/** Languages whose words are whitespace-delimited; Mandarin compares on hanzi. */
const SPACE_DELIMITED: Record<LanguageCode, boolean> = {
  id: true,
  zh: false,
  fr: true,
  it: true,
  es: true,
};

/**
 * Canonical normalization shared by the app's evaluator and the content
 * validator (plan §3.3): lowercase, strip punctuation/symbols, collapse
 * whitespace, keep diacritics. Apostrophes and hyphens become token breaks
 * ("j'ai" → "j ai") — consistent on both sides, so matching is unaffected.
 * For zh, all whitespace is removed and comparison happens on hanzi.
 */
export function normalize(text: string, lang: LanguageCode): string {
  const stripped = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ');
  if (!SPACE_DELIMITED[lang]) {
    return stripped.replace(/\s+/gu, '');
  }
  return stripped.replace(/\s+/gu, ' ').trim();
}

/**
 * Units for token-level edit distance: words for space-delimited languages,
 * individual code points (hanzi) for Mandarin. Input must already be
 * normalized.
 */
export function tokenize(normalized: string, lang: LanguageCode): string[] {
  if (!SPACE_DELIMITED[lang]) {
    return Array.from(normalized);
  }
  return normalized.length === 0 ? [] : normalized.split(' ');
}
