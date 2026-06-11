# Kataku content spec

Expands plan.md §2 (pedagogy) and §5 (schema) into authoring rules. Every
unit is generated in a Claude Code session following this spec, then
**reviewed by the owner before any audio is rendered**.

## Non-negotiables

1. **Original content only** (plan §5.3). The Michel Thomas *principles* are
   the spec; never reproduce or mirror any commercial course's scripts,
   sentences, or lesson sequence.
2. Nothing is taught in isolation: a block is introduced in seconds
   (`teach_script`) and immediately used inside prompts combining it with
   known blocks.
3. Errors are information: every difficulty ≥ 2 prompt carries a
   `decompose_script` naming the structure most likely missed — one short
   sentence, no scolding.
4. Praise is specific and earned. System lines confirm plainly ("Yes —");
   no hollow cheering after every utterance.

## File and ID conventions

- One pack per language: `content/<lang>/foundation.json` (schema: plan §5.1
  + `templates` + `system_lines`, see `src/lib/content/types.ts`).
- Item ids `<lang>-f-NNN`, prompt ids `<lang>-f-p-NNN`, zero-padded, never
  reused or renumbered after audio exists (audio keys derive from them).
- Audio keys: items `<id>-t` (teach); prompts `<id>-c` (cue), `<id>-a`
  (answer), `<id>-s` (slow answer), `<id>-d` (decompose, optional).
- A lesson has 2–4 new items and 12–20 prompts. **The final 3 prompts are
  the victory lap** (convention consumed by the session builder): the
  lesson's highest difficulty (3 once the vocabulary allows it; early
  lessons cap at 2), recombining the lesson's blocks with older ones, no
  new material.
- Difficulty: 1 = 2–3 words, 2 = 4–5 words, 3 = 6+ words or multi-clause.

## Expected-variant policy

- `expected[0]` is canonical and is what the answer audio says.
- Accept variants the learner could legitimately produce: pronoun-dropped
  forms where natural, `aku` for `saya`, object-dropped forms where the
  language allows. Do **not** accept forms a native listener would hear as
  wrong.
- Canonical word order puts time words last (`… sekarang`, `… besok`).
- All variants must survive `normalize()` round-trip (validated by
  `npm run validate-content`).

## Indonesian Foundation — register and sequencing

Foundation teaches **neutral-polite** Indonesian (saya, tidak, standard
forms) — the everyday Bali register (aku/nggak/dong) is Builder material
(stretch S3). `aku` is accepted as a variant, never taught.

High-leverage order (plan §2.5): modals + bare verbs from minute one (no
conjugation to slow things down), question-by-intonation for free questions,
negation, demonstratives, then the tense system as three little words
(sudah/belum/akan) — at which point past and future are unlocked without
any morphology.

### Week 1 lesson arc (Unit 1, lessons 1–7)

| # | New blocks | Unlocks |
|---|---|---|
| 1 | saya, mau, makan, minum | "I want to eat/drink" — wants, day one |
| 2 | kamu, tidak (+ question-intonation pattern, pronoun-drop usage note) | questions, refusals, talking to someone |
| 3 | pergi, ke, pasar, sekarang | movement, destinations, "now" |
| 4 | bisa, harus, nanti, pulang | ability, obligation, "later", going home |
| 5 | ini, itu, bagus, tapi | pointing at the world, opinions, contrast |
| 6 | sudah, belum, beli (+ answering with sudah/belum) | the past, "not yet", shopping |
| 7 | akan, besok, karena | the future, reasons, multi-clause sentences |

End-of-week target (plan §2.6): the learner builds
"Saya tidak bisa pergi ke pasar sekarang karena saya harus makan" unaided.

Language notes baked into this arc:
- "go home" is **pulang**, its own verb — `pergi ke rumah` sounds like
  visiting someone's house, so `rumah` is deferred.
- Yes/no answers to sudah-questions are **Sudah./Belum.** — taught
  explicitly in lesson 6; answering "ya" is a calque worth heading off.
- `mau` doubles as near-future in speech; Foundation keeps it as "want"
  and introduces `akan` for the future in lesson 7.

### Weeks 2 (lessons 8–14) — outline for later authoring

dia & names · suka + nouns/verbs (likes) · ada (there is/have) · di + places
(location) · apa/siapa/di mana questions · bisa/boleh distinction · numbers
1–10 + harga (price asking) · punya (possession) · kalau (if) · jadi (so) ·
recap + long-recombination finale. Sequence final when Week 1 has been
street-tested.

## Spanish & French Foundation — Week 1 (quality baselines)

Authored 2026-06-11 at the owner's request: he is conversational in Spanish
and speaks some French, so these packs exist primarily to benchmark app
quality (recognition fairness, audio naturalness, matching strictness)
against languages he can already judge — and they reuse the same original
Week-1 arc as Indonesian, which makes cross-language comparison direct.

Romance adaptations (plan §2.5):
- **Modal scaffolds carry the person**: quiero/quieres, je veux/tu veux are
  taught as fused blocks — no conjugation tables, the ending *is* the
  pronoun. Spanish is pro-drop (canonical answers omit yo/tú; variants
  accept them); French keeps its pronouns.
- **The future is a scaffold, not a tense**: voy a / vas a, je vais / tu vas
  + infinitive. Real past tense (passé composé, pretérito) is Builder
  material; Indonesian got sudah/belum instead, which has no Romance
  equivalent this cheap.
- **Contractions taught as patterns**: al (a+el), au (à+le).
- **French negation** is the ne…pas sandwich, canonical with `ne`; the
  spoken-French ne-drop ("je veux pas") is taught as a usage note and
  accepted as a variant everywhere — mirror of Indonesian's aku policy.
- **Normalization keeps word-internal apostrophes** (c'est, aujourd'hui are
  single tokens) — this is engine-level (`normalize.ts`), shared by all
  languages.
- "go home" gets its own verb in both: a casa (es) / rentrer (fr) —
  parallel to pulang.

## Templates (speakable-sentences counter)

Templates list item ids per slot; the counter multiplies mastered fillers
(optional slots add the omitted case). Keep templates honest — only
combinations a native speaker would accept. Question-intonation versions are
counted by a multiplier template only where natural.

## System lines

Per-pack `system_lines` render once with the cheap English voice: confirm
("Yes —"), almost ("Almost — listen:"), miss intro ("Here it is again —"),
session open/close, victory-lap intro. Keys are stable (`sys-*`); see the
pack file.
