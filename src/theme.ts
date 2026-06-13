/**
 * Look-and-feel tokens (docs/design-principles.md + design_handoff_kataku).
 * One hue logic, two palettes: green = go/pass/progress, teal = the learner's
 * own voice (and only that), apricot = near-miss only, slate = miss. No red,
 * ever — misses are information.
 *
 * LIGHT is the warm editorial ground (owner directive 2026-06-13: match the
 * Stories pages everywhere) — cream paper, warm-ink text — with the neutrals
 * kept dark enough to survive direct Bali sun (handoff Refinement 2) and the
 * functional hues deepened to hold their meaning on cream. DARK is unchanged
 * (Stories already shares the dark ground). Stories' own editorial skin lives
 * in storyPalettes below.
 */

export interface Palette {
  bg: string;
  card: string;
  raised: string;
  stroke: string;

  text: string;
  dim: string;
  faint: string;

  /** Primary action / pass / progress. */
  accent: string;
  onAccent: string;
  accentDeep: string;
  /** The learner's live voice: partial transcripts, resume, mic glow. */
  live: string;

  /** Near-miss only. */
  warn: string;
  warnDeep: string;
  /** Miss = information, never failure. */
  miss: string;
  missDeep: string;
}

export const palettes: Record<'dark' | 'light', Palette> = {
  dark: {
    bg: '#0C1117',
    card: '#161D27',
    raised: '#212B3A',
    stroke: '#2D3950',

    text: '#F2F6FA',
    dim: '#9AA7B9',
    faint: '#5F6E80',

    accent: '#45D483',
    onAccent: '#07130C',
    accentDeep: '#15301F',
    live: '#6FD6C3',

    warn: '#E3A968',
    warnDeep: '#382B14',
    miss: '#94A3B8',
    missDeep: '#232E3C',
  },
  light: {
    // Warm editorial ground (Stories palette, app-wide).
    bg: '#F4F0E8', // warm cream paper
    card: '#FFFFFF',
    raised: '#ECE6DA', // warm input/secondary track
    stroke: '#E1DACB', // warm hairline

    text: '#2A2620', // warm near-black ink
    dim: '#5E574A', // warm grey, kept dark for ambient English in sun (Refinement 2)
    faint: '#8C8579', // warm grey — captions / spend figure only

    accent: '#0B7C45', // pass-green deepened to survive the cream wash (Refinement 2)
    onAccent: '#FFFFFF',
    accentDeep: '#D8ECCF', // warm pale green — learner bubble / resume / pass wash
    live: '#0E9C84', // the learner's voice — teal, tuned for cream

    warn: '#A8690F', // near-miss apricot on cream
    warnDeep: '#F3E7CF',
    miss: '#6B6253', // miss = information (warm slate)
    missDeep: '#E8E1D4',
  },
};

/**
 * Stories' editorial sub-theme (handoff): a warmer, more literary skin for the
 * passive read-along player — serif titles, cream/ink ground, the Kataku teal
 * tuned brighter. Same no-red / teal-is-the-live-voice rules. Stories screens
 * use these; everything else uses `palettes`.
 */
export interface StoryPalette {
  paper: string;
  card: string;
  ink: string; // titles + transcript target-language
  sub: string; // English glosses, descriptions
  hair: string; // hairlines / card borders
  teal: string; // progress, play, the active (currently-heard) line
  badgeBg: string;
  badgeText: string;
  track: string; // progress track
}

export const storyPalettes: Record<'dark' | 'light', StoryPalette> = {
  light: {
    paper: '#F4F0E8',
    card: '#FFFFFF',
    ink: '#2A2620',
    sub: '#8B867C',
    hair: '#E7E1D5',
    teal: '#15B49A',
    badgeBg: '#ECE7DC',
    badgeText: '#948B7E',
    track: 'rgba(40,30,15,0.10)',
  },
  dark: {
    paper: '#0C1117',
    card: '#161D27',
    ink: '#F2F6FA',
    sub: '#9AA7B9',
    hair: '#222C3B',
    teal: '#34CDB2',
    badgeBg: '#212B3A',
    badgeText: '#8696AB',
    track: 'rgba(255,255,255,0.10)',
  },
};

/** The one place the app leaves SF Pro: Stories titles (bundle Newsreader). */
export const SERIF = 'Newsreader';

export const type = {
  hero: 44,
  giant: 34,
  title: 26,
  heading: 21,
  body: 17,
  small: 14,
  caption: 12,

  // Teacher-chat hierarchy (owner spec, 2026-06-12): taught text is always
  // the largest thing in the chat; the "now say" cue is the clear second;
  // the verdict sits one px above ambient narration, semibold + colored.
  taught: 20,
  cue: 16,
  verdict: 15,
};

export const space = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  s: 10,
  m: 16,
  l: 24,
  xl: 32,
  pill: 999,
};

export type ResultKind = 'pass' | 'near' | 'miss' | 'skip';

/** Result → presentation, per palette. */
export function resultFor(p: Palette, kind: ResultKind): { tint: string; deep: string; label: string } {
  switch (kind) {
    case 'pass':
      return { tint: p.accent, deep: p.accentDeep, label: 'Yes.' };
    case 'near':
      return { tint: p.warn, deep: p.warnDeep, label: 'Almost — listen:' };
    case 'miss':
      return { tint: p.miss, deep: p.missDeep, label: 'Listen:' };
    case 'skip':
      return { tint: p.miss, deep: p.missDeep, label: 'Here it is:' };
  }
}
