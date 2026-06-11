import { LanguageCode, normalize, tokenize } from './normalize';
import { similarity } from './levenshtein';

export type MatchResult = 'pass' | 'near' | 'miss';

export interface Evaluation {
  result: MatchResult;
  /** Best token-level similarity across all expected variants (1 on pass). */
  similarity: number;
  /** The normalized variant that scored best — used by feedback to pick what to replay. */
  bestVariant: string;
  transcriptNormalized: string;
}

/** Plan §3.3: token-level similarity at or above this is a near-miss. */
export const NEAR_THRESHOLD = 0.8;

export interface EvaluateOptions {
  /**
   * Mandarin secondary check: fold hanzi to toneless pinyin (e.g. via
   * pinyin-pro, bundled with the zh pack). Returns null when folding isn't
   * available; matching then relies on hanzi comparison alone. Injected so
   * src/lib stays dependency-free until Mandarin ships (M5).
   */
  pinyinFold?: (hanzi: string) => string | null;
}

/**
 * The intelligibility judge (plan §3.3). If the target-locale recognizer
 * heard the expected sentence, the learner was intelligible — that is the
 * whole pronunciation gate.
 */
export function evaluate(
  transcript: string,
  expected: readonly string[],
  lang: LanguageCode,
  opts: EvaluateOptions = {},
): Evaluation {
  const transcriptNormalized = normalize(transcript, lang);
  const variants = expected.map((v) => normalize(v, lang));
  const canonical = variants[0] ?? '';

  if (transcriptNormalized.length === 0) {
    return { result: 'miss', similarity: 0, bestVariant: canonical, transcriptNormalized };
  }

  const heardTokens = tokenize(transcriptNormalized, lang);
  let best = 0;
  let bestVariant = canonical;
  for (const variant of variants) {
    if (variant === transcriptNormalized) {
      return { result: 'pass', similarity: 1, bestVariant: variant, transcriptNormalized };
    }
    const score = similarity(heardTokens, tokenize(variant, lang));
    if (score > best) {
      best = score;
      bestVariant = variant;
    }
  }

  if (best >= NEAR_THRESHOLD) {
    return { result: 'near', similarity: best, bestVariant, transcriptNormalized };
  }

  // Mandarin: same toneless pinyin with different hanzi means the learner
  // said the right syllables — near, not miss.
  if (lang === 'zh' && opts.pinyinFold) {
    const heardPinyin = opts.pinyinFold(transcriptNormalized);
    if (heardPinyin !== null) {
      for (const variant of variants) {
        if (opts.pinyinFold(variant) === heardPinyin) {
          return { result: 'near', similarity: best, bestVariant: variant, transcriptNormalized };
        }
      }
    }
  }

  return { result: 'miss', similarity: best, bestVariant, transcriptNormalized };
}
