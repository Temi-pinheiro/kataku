import { describe, expect, it } from 'vitest';
import type { CourseOutline } from '../../content/outlines';
import {
  flattenModules,
  modulesFor,
  moduleById,
  firstIncompleteId,
  nextModule,
  moduleState,
  knownWordsBefore,
} from './manifest';

const OUTLINE: CourseOutline = [
  {
    label: 'Month 1',
    weeks: [
      { label: 'Week 1', lessons: [{ topic: 'A', words: 'a1 · a2' }, { topic: 'B', words: 'b1 · a2' }] },
      { label: '', lessons: [{ topic: 'C', words: 'c1' }] },
    ],
  },
  { label: 'Month 2', weeks: [{ label: '', lessons: [{ topic: 'D', words: 'd1 · d2' }] }] },
];

describe('flattenModules', () => {
  it('flattens months/weeks/lessons into an ordered spine with stable ids', () => {
    const mods = flattenModules('id', OUTLINE);
    expect(mods.map((m) => m.id)).toEqual(['id-0', 'id-1', 'id-2', 'id-3']);
    expect(mods.map((m) => m.index)).toEqual([0, 1, 2, 3]);
    expect(mods.map((m) => m.topic)).toEqual(['A', 'B', 'C', 'D']);
    expect(mods[0]).toMatchObject({ monthLabel: 'Month 1', weekLabel: 'Week 1' });
    expect(mods[3]).toMatchObject({ monthLabel: 'Month 2', weekLabel: '', language: 'id' });
  });
});

describe('firstIncompleteId', () => {
  const mods = flattenModules('id', OUTLINE);
  it('is the first module when nothing is done', () => {
    expect(firstIncompleteId(mods, new Set())).toBe('id-0');
  });
  it('skips completed modules in order', () => {
    expect(firstIncompleteId(mods, new Set(['id-0', 'id-1']))).toBe('id-2');
  });
  it('finds an incomplete module even after a later one is done', () => {
    expect(firstIncompleteId(mods, new Set(['id-0', 'id-2']))).toBe('id-1');
  });
  it('falls back to the last module once everything is done (revisit)', () => {
    expect(firstIncompleteId(mods, new Set(['id-0', 'id-1', 'id-2', 'id-3']))).toBe('id-3');
  });
  it('is null for an empty spine', () => {
    expect(firstIncompleteId([], new Set())).toBeNull();
  });
});

describe('nextModule', () => {
  const mods = flattenModules('id', OUTLINE);
  it('returns the following module', () => {
    expect(nextModule(mods, 'id-1')?.id).toBe('id-2');
  });
  it('is null at the end of the spine', () => {
    expect(nextModule(mods, 'id-3')).toBeNull();
  });
  it('is null for an unknown id', () => {
    expect(nextModule(mods, 'id-99')).toBeNull();
  });
});

describe('moduleState', () => {
  const mods = flattenModules('id', OUTLINE);
  const completed = new Set(['id-0']);
  it('marks the current pointer here, even over a completed module', () => {
    expect(moduleState(mods[0], completed, 'id-0')).toBe('here');
  });
  it('marks other completed modules done', () => {
    expect(moduleState(mods[0], completed, 'id-1')).toBe('done');
  });
  it('marks the current module here and the rest ahead', () => {
    expect(moduleState(mods[1], completed, 'id-1')).toBe('here');
    expect(moduleState(mods[2], completed, 'id-1')).toBe('ahead');
  });
});

describe('knownWordsBefore', () => {
  const mods = flattenModules('id', OUTLINE);
  it('collects de-duped focus words from earlier modules only', () => {
    // before index 2 = modules A (a1,a2) and B (b1,a2) → a2 not repeated
    expect(knownWordsBefore(mods, 2)).toEqual(['a1', 'a2', 'b1']);
  });
  it('is empty before the first module', () => {
    expect(knownWordsBefore(mods, 0)).toEqual([]);
  });
});

describe('modulesFor (real outlines)', () => {
  it('builds a non-empty, sequentially-id\'d spine for each language', () => {
    for (const lang of ['id', 'es', 'fr', 'it'] as const) {
      const mods = modulesFor(lang);
      expect(mods.length).toBeGreaterThan(0);
      mods.forEach((m, i) => expect(m.id).toBe(`${lang}-${i}`));
      expect(moduleById(lang, `${lang}-0`)?.index).toBe(0);
    }
  });
});
