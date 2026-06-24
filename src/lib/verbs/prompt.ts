/**
 * Prompt builders for the verbs reference — pure (no react-native / node), so
 * the on-device service and the Node seed script generate identical-quality
 * pages from the same instructions. Originality (hard rule #1) is enforced
 * here: example sentences must be original, never copied from any course.
 */

export function classifySystem(langName: string): string {
  return (
    `You are a precise linguistic tagger for a ${langName} course. You receive a JSON array of ${langName} ` +
    `words or short phrases (already lowercased). For EACH one, return its part of speech and dictionary form. ` +
    `Respond with JSON {"items":[{"surface":<exactly as given>,"lemma":<dictionary/infinitive form>,` +
    `"pos":<one of: verb, noun, adjective, adverb, phrase, other>,"gloss":<short English gloss>}]}. ` +
    `For verbs the lemma is the infinitive. Echo every surface I send, unchanged. No commentary.`
  );
}

export function detailSystem(langName: string): string {
  return (
    `You are an expert ${langName} teacher writing a reference card for ONE verb. Be accurate above all, and ` +
    `make every example sentence ORIGINAL — never copy a textbook, course, or published material. ` +
    `Adapt to ${langName}'s real morphology:\n` +
    `- If ${langName} conjugates by person and tense (e.g. Spanish, French, Italian): give one table per core ` +
    `tense a learner needs — present, the main past tense(s), imperfect, future, conditional, present subjunctive, ` +
    `imperative, and a non-finite table (gerund/participle). Each table row is [person/pronoun, form].\n` +
    `- If ${langName} does NOT conjugate that way (e.g. Indonesian): do NOT invent a person×tense grid. Instead give ` +
    `tables for the affixed forms (e.g. me-, ber-, di-, -kan, -i) and for how time/aspect is shown with markers ` +
    `(e.g. sudah, sedang, akan, belum); each row is [form, meaning].\n` +
    `Respond with ONLY valid JSON (no markdown) in this exact shape:\n` +
    `{"lemma":string,"glossEn":string,"regular":boolean|null,` +
    `"tables":[{"label":string,"columns"?:string[],"rows":string[][]}],` +
    `"examples":[{"target":string,"en":string}],"notes":string[]}\n` +
    `Give 3-5 beginner-friendly example sentences. Notes should cover irregularities, the prepositions/cases the ` +
    `verb takes, and common collocations. "regular" is null when the notion doesn't apply to ${langName}.`
  );
}

export function detailUser(langName: string, lemma: string, glossEn: string): string {
  return `Verb: "${lemma}"${glossEn ? ` (${glossEn})` : ''}. Language: ${langName}.`;
}
