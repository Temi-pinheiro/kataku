/**
 * Look-and-feel tokens (docs/design-principles.md). Two palettes, one hue
 * logic: an analogous green→teal family carries everything "alive" (speech,
 * progress, live transcript); a muted apricot exists only for near-miss
 * semantics (a saturated yellow is blue's complement and vibrates against
 * the dark base — the v2 mistake); slate for misses. Misses are never red.
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
    bg: '#F4F7F9',
    card: '#FFFFFF',
    raised: '#E9EFF4',
    stroke: '#D5DEE7',

    text: '#15202B',
    dim: '#56697D',
    faint: '#8898A9',

    accent: '#12A35B',
    onAccent: '#FFFFFF',
    accentDeep: '#D9F3E4',
    live: '#0C8B77',

    warn: '#B0741B',
    warnDeep: '#F8ECD2',
    miss: '#5D7187',
    missDeep: '#E3EAF1',
  },
};

export const type = {
  hero: 44,
  giant: 34,
  title: 26,
  heading: 21,
  body: 17,
  small: 14,
  caption: 12,
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
