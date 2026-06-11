/**
 * One place for look-and-feel. Design principles (docs/design-principles.md):
 * dark, calm, voice-first — the screen is a remote control. Motion and color
 * communicate state, never decorate. Misses are never red (plan §2.4).
 */

export const colors = {
  // surfaces
  bg: '#0B0F14',
  card: '#151C26', // primary surface
  raised: '#1E2836', // controls / sheet surface
  stroke: '#2A3648',

  // content
  text: '#F4F7FA',
  dim: '#8E9BAE',
  faint: '#5C6878',

  // brand + semantics
  accent: '#4ADE80', // go / speech / pass
  accentDeep: '#16331F',
  warn: '#FBBF24', // near-miss, live transcript
  warnDeep: '#3A2E10',
  miss: '#94A3B8', // information, never failure
  missDeep: '#222B38',

  onAccent: '#08110B',
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

/** Result → presentation. */
export const resultStyle = {
  pass: { tint: colors.accent, deep: colors.accentDeep, label: 'Yes.' },
  near: { tint: colors.warn, deep: colors.warnDeep, label: 'Almost — listen:' },
  miss: { tint: colors.miss, deep: colors.missDeep, label: 'Listen:' },
  skip: { tint: colors.miss, deep: colors.missDeep, label: 'Here it is:' },
} as const;
