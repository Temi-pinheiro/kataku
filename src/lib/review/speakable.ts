import type { CoursePack, SentenceTemplate } from '../content/types';

/**
 * The speakable-sentences counter (plan §8.1): an estimate of distinct
 * grammatical sentences constructible from mastered blocks. Per template,
 * the product of mastered fillers per slot (optional slots contribute
 * +1 for omission); templates missing any required slot contribute zero.
 * It's an estimate and the UI says so — its job is to make combinatorial
 * growth visible.
 */
export function speakableCount(templates: readonly SentenceTemplate[], masteredIds: ReadonlySet<string>): number {
  let total = 0;
  for (const template of templates) {
    total += templateCount(template, masteredIds);
  }
  return total;
}

function templateCount(template: SentenceTemplate, masteredIds: ReadonlySet<string>): number {
  let product = 1;
  for (const slot of template.slots) {
    const mastered = slot.fillers.filter((f) => masteredIds.has(f)).length;
    const options = mastered + (slot.optional ? 1 : 0);
    if (options === 0) return 0;
    product *= options;
  }
  return product;
}

export function speakableCountForPack(pack: CoursePack, masteredIds: ReadonlySet<string>): number {
  return speakableCount(pack.templates, masteredIds);
}

/** "~2,400" — rounded so the number reads as the estimate it is. */
export function roundSpeakable(n: number): number {
  if (n < 20) return n;
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / magnitude) * magnitude;
}
