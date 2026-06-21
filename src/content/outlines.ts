import type { InstalledLanguage } from '../packs';

/**
 * Course outlines for "Your map" (handoff): a browsable spine of the
 * protocol — Month → Week → lesson nodes (topic + the words it teaches).
 * Derived from the prose protocols (content/teacher/*.md) into a compact,
 * machine-readable table of contents. Done/here/ahead is computed from how
 * much the learner actually owns, not stored here — this is just the path.
 *
 * Words are illustrative anchors (a few per lesson), not the full vocabulary.
 */
export interface OutlineLesson {
  topic: string;
  words: string;
}
export interface OutlineWeek {
  label: string;
  lessons: OutlineLesson[];
}
export interface OutlineMonth {
  label: string;
  weeks: OutlineWeek[];
}
export type CourseOutline = OutlineMonth[];

const id: CourseOutline = [
  {
    label: 'Month 1 — Foundations',
    weeks: [
      {
        label: 'Week 1',
        lessons: [
          { topic: 'Who & what', words: 'saya · Anda · dia · ini · itu' },
          { topic: 'The engine words', words: 'mau · bisa · suka · harus' },
          { topic: 'Saying no three ways', words: 'tidak · bukan · belum' },
          { topic: 'The time machine', words: 'sudah · akan · sedang · masih' },
          { topic: 'Asking', words: 'apa · di mana · siapa · berapa' },
        ],
      },
      {
        label: 'Week 2',
        lessons: [
          { topic: 'The glue', words: 'dan · tapi · karena · kalau' },
          { topic: 'Places & movement', words: 'ke · di · dari · pulang' },
          { topic: 'First roleplay', words: 'warung · harga · pesan' },
        ],
      },
    ],
  },
  {
    label: 'Month 2 — Building the engine',
    weeks: [
      { label: 'Week 3', lessons: [{ topic: 'yang — the one-word upgrade', words: 'yang' }] },
      { label: 'Week 4', lessons: [{ topic: '-nya & having', words: '-nya · punya' }] },
      { label: 'Week 5', lessons: [{ topic: 'For and to people', words: 'untuk · sama' }] },
      { label: 'Week 6', lessons: [{ topic: 'Time in full', words: 'jam · hari · minggu' }] },
      { label: 'Weeks 7–8', lessons: [{ topic: 'First affixes; sounding human', words: 'ber- · dong · sih' }] },
    ],
  },
  {
    label: 'Month 3 — Storytelling',
    weeks: [{ label: '', lessons: [{ topic: 'The friends register & past stories', words: 'aku · nggak · tadi' }] }],
  },
  {
    label: 'Month 4 — The affix system',
    weeks: [{ label: '', lessons: [{ topic: 'me-/-kan/-i for real', words: 'me- · -kan · -i' }] }],
  },
  {
    label: 'Month 5 — Range',
    weeks: [{ label: '', lessons: [{ topic: 'Opinion, debate, the colloquial ear', words: 'menurut saya · sebenarnya' }] }],
  },
  {
    label: 'Month 6 — Autonomy',
    weeks: [{ label: '', lessons: [{ topic: 'Carrying your own conversations', words: 'free conversation' }] }],
  },
];

const es: CourseOutline = [
  {
    label: 'Month 1 — Foundations',
    weeks: [
      {
        label: 'Week 1',
        lessons: [
          { topic: 'Cognates & is', words: 'es · está · -ción words' },
          { topic: 'The launcher verbs', words: 'quiero · puedo · tengo que' },
          { topic: 'Going to & infinitives', words: 'voy a · necesito' },
          { topic: 'No, and, but, because', words: 'no · y · pero · porque' },
          { topic: 'Asking', words: 'qué · dónde · cuándo · por qué' },
        ],
      },
      {
        label: 'Week 2',
        lessons: [
          { topic: 'Time & place anchors', words: 'hoy · mañana · aquí' },
          { topic: 'Having & there is', words: 'tengo · hay' },
          { topic: 'First roleplay', words: 'por favor · la cuenta' },
        ],
      },
    ],
  },
  {
    label: 'Month 2 — The past',
    weeks: [
      { label: 'Weeks 3–4', lessons: [{ topic: 'Pronouns & the present, completed', words: 'lo · la · me · te' }] },
      { label: 'Weeks 5–6', lessons: [{ topic: 'Pretérito — yesterday', words: 'fui · comí · hablé' }] },
      { label: 'Weeks 7–8', lessons: [{ topic: 'Imperfecto — used to', words: 'era · había · hacía' }] },
    ],
  },
  { label: 'Month 3 — Future & conditional', weeks: [{ label: '', lessons: [{ topic: 'Will & would', words: 'haré · haría' }] }] },
  { label: 'Month 4 — Pronoun mastery', weeks: [{ label: '', lessons: [{ topic: 'Two pronouns, reflexives', words: 'se lo · me lo' }] }] },
  { label: 'Month 5 — Subjunctive doorway', weeks: [{ label: '', lessons: [{ topic: 'Opinion & doubt', words: 'creo que · quizás' }] }] },
  { label: 'Month 6 — Autonomy', weeks: [{ label: '', lessons: [{ topic: 'Carrying your own conversations', words: 'free conversation' }] }] },
];

const fr: CourseOutline = [
  {
    label: 'Month 1 — Foundations',
    weeks: [
      {
        label: 'Week 1',
        lessons: [
          { topic: 'Cognates & it is', words: "c'est · ce n'est pas" },
          { topic: 'The launcher verbs', words: 'je voudrais · je peux · je dois' },
          { topic: 'Going to & infinitives', words: 'je vais · je veux' },
          { topic: 'Negation & asking', words: 'ne…pas · est-ce que' },
          { topic: 'For me, with, but, because', words: 'pour moi · avec · parce que' },
        ],
      },
      {
        label: 'Week 2',
        lessons: [
          { topic: 'Time anchors & politeness', words: "maintenant · aujourd'hui · vous" },
          { topic: 'There is & having', words: "il y a · j'ai" },
          { topic: 'First roleplay', words: "l'addition · s'il vous plaît" },
        ],
      },
    ],
  },
  {
    label: 'Month 2 — The past',
    weeks: [
      { label: 'Weeks 3–4', lessons: [{ topic: 'Pronouns & the present, completed', words: 'le · la · me · te' }] },
      { label: 'Weeks 5–6', lessons: [{ topic: 'Passé composé — yesterday', words: "j'ai fait · j'ai mangé" }] },
      { label: 'Weeks 7–8', lessons: [{ topic: 'Imparfait — used to', words: 'était · il y avait' }] },
    ],
  },
  { label: 'Month 3 — Future & conditional', weeks: [{ label: '', lessons: [{ topic: 'Will & would', words: 'je ferai · je ferais' }] }] },
  { label: 'Month 4 — Pronoun mastery', weeks: [{ label: '', lessons: [{ topic: 'y, en, two pronouns', words: 'y · en' }] }] },
  { label: 'Month 5 — Subjunctive doorway', weeks: [{ label: '', lessons: [{ topic: 'Opinion & necessity', words: 'il faut que · je pense que' }] }] },
  { label: 'Month 6 — Autonomy', weeks: [{ label: '', lessons: [{ topic: 'Carrying your own conversations', words: 'free conversation' }] }] },
];

const it: CourseOutline = [
  {
    label: 'Month 1 — Foundations',
    weeks: [
      {
        label: 'Week 1',
        lessons: [
          { topic: 'Cognates & is', words: 'è · non è · -zione words' },
          { topic: 'The launcher verbs', words: 'vorrei · voglio · posso · devo' },
          { topic: 'Asking & connectors', words: 'che cosa · dove · perché' },
          { topic: 'Time anchors, there is', words: "oggi · adesso · c'è" },
        ],
      },
      { label: 'Week 2', lessons: [{ topic: 'First roleplay', words: 'il conto · per favore' }] },
    ],
  },
  { label: 'Month 2 — The past', weeks: [{ label: '', lessons: [{ topic: 'Passato prossimo', words: 'ho fatto · ho mangiato' }] }] },
  { label: 'Months 3–6 — ahead', weeks: [{ label: '', lessons: [{ topic: 'Future, conditional, subjunctive doorway', words: 'farò · farei' }] }] },
];

export const OUTLINES: Record<InstalledLanguage, CourseOutline> = { id, es, fr, it };
