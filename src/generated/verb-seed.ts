import type { VerbEntry } from '../lib/verbs/types';

/**
 * Bundled, pre-generated verb pages — keyed `${lang}:${lemma}`. These ship in
 * the app so the most common verbs cost ZERO tokens even on first view (and any
 * future install gets them free). The on-device cache + Phase C shared cache
 * cover everything else.
 *
 * Regenerate/expand with `npm run generate-verb-seed` (owner-run, cost-metered),
 * then spot-check accuracy before shipping (hard rule #6). The two entries below
 * are hand-verified placeholders + a shape reference; the script overwrites this
 * file with the full curated list.
 */
export const VERB_SEED: Record<string, VerbEntry> = {
  'es:hablar': {
    lemma: 'hablar',
    glossEn: 'to speak, to talk',
    regular: true,
    tables: [
      {
        label: 'Present',
        rows: [
          ['yo', 'hablo'],
          ['tú', 'hablas'],
          ['él/ella/usted', 'habla'],
          ['nosotros', 'hablamos'],
          ['vosotros', 'habláis'],
          ['ellos/ustedes', 'hablan'],
        ],
      },
      {
        label: 'Preterite (past)',
        rows: [
          ['yo', 'hablé'],
          ['tú', 'hablaste'],
          ['él/ella/usted', 'habló'],
          ['nosotros', 'hablamos'],
          ['vosotros', 'hablasteis'],
          ['ellos/ustedes', 'hablaron'],
        ],
      },
      {
        label: 'Imperfect',
        rows: [
          ['yo', 'hablaba'],
          ['tú', 'hablabas'],
          ['él/ella/usted', 'hablaba'],
          ['nosotros', 'hablábamos'],
          ['vosotros', 'hablabais'],
          ['ellos/ustedes', 'hablaban'],
        ],
      },
      {
        label: 'Future',
        rows: [
          ['yo', 'hablaré'],
          ['tú', 'hablarás'],
          ['él/ella/usted', 'hablará'],
          ['nosotros', 'hablaremos'],
          ['vosotros', 'hablaréis'],
          ['ellos/ustedes', 'hablarán'],
        ],
      },
      {
        label: 'Present subjunctive',
        rows: [
          ['yo', 'hable'],
          ['tú', 'hables'],
          ['él/ella/usted', 'hable'],
          ['nosotros', 'hablemos'],
          ['vosotros', 'habléis'],
          ['ellos/ustedes', 'hablen'],
        ],
      },
      {
        label: 'Non-finite',
        rows: [
          ['gerund', 'hablando'],
          ['past participle', 'hablado'],
        ],
      },
    ],
    examples: [
      { target: 'Hablo un poco de español.', en: 'I speak a little Spanish.' },
      { target: '¿Hablas inglés?', en: 'Do you speak English?' },
      { target: 'Ayer hablé con mi madre.', en: 'Yesterday I spoke with my mother.' },
    ],
    notes: [
      'Fully regular -ar verb — the model for the whole -ar group.',
      'Takes "con" for the person you talk with: hablar con alguien.',
      'Use "hablar de" for the topic you talk about: hablar de política.',
    ],
  },
  'es:querer': {
    lemma: 'querer',
    glossEn: 'to want; to love',
    regular: false,
    tables: [
      {
        label: 'Present (e→ie stem change)',
        rows: [
          ['yo', 'quiero'],
          ['tú', 'quieres'],
          ['él/ella/usted', 'quiere'],
          ['nosotros', 'queremos'],
          ['vosotros', 'queréis'],
          ['ellos/ustedes', 'quieren'],
        ],
      },
      {
        label: 'Preterite (irregular stem quis-)',
        rows: [
          ['yo', 'quise'],
          ['tú', 'quisiste'],
          ['él/ella/usted', 'quiso'],
          ['nosotros', 'quisimos'],
          ['vosotros', 'quisisteis'],
          ['ellos/ustedes', 'quisieron'],
        ],
      },
      {
        label: 'Imperfect (regular)',
        rows: [
          ['yo', 'quería'],
          ['tú', 'querías'],
          ['él/ella/usted', 'quería'],
          ['nosotros', 'queríamos'],
          ['vosotros', 'queríais'],
          ['ellos/ustedes', 'querían'],
        ],
      },
      {
        label: 'Future (irregular stem querr-)',
        rows: [
          ['yo', 'querré'],
          ['tú', 'querrás'],
          ['él/ella/usted', 'querrá'],
          ['nosotros', 'querremos'],
          ['vosotros', 'querréis'],
          ['ellos/ustedes', 'querrán'],
        ],
      },
      {
        label: 'Present subjunctive',
        rows: [
          ['yo', 'quiera'],
          ['tú', 'quieras'],
          ['él/ella/usted', 'quiera'],
          ['nosotros', 'queramos'],
          ['vosotros', 'queráis'],
          ['ellos/ustedes', 'quieran'],
        ],
      },
      {
        label: 'Non-finite',
        rows: [
          ['gerund', 'queriendo'],
          ['past participle', 'querido'],
        ],
      },
    ],
    examples: [
      { target: 'Quiero un café, por favor.', en: 'I want a coffee, please.' },
      { target: '¿Quieres venir conmigo?', en: 'Do you want to come with me?' },
      { target: 'Te quiero mucho.', en: 'I love you very much.' },
    ],
    notes: [
      'Stem-changing (e→ie) in the present, plus an irregular preterite (quis-) and future/conditional stem (querr-).',
      '"Querer a alguien" means to love a person; "querer algo" means to want a thing.',
      '"Querer" + infinitive expresses wanting to do something: quiero comer.',
    ],
  },
};
