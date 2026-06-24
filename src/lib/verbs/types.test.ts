import { describe, expect, it } from 'vitest';
import { normalizePos, parseClassifications, parseVerbEntry } from './types';

describe('normalizePos', () => {
  it('folds loose labels onto the enum', () => {
    expect(normalizePos('verb')).toBe('verb');
    expect(normalizePos('V')).toBe('verb');
    expect(normalizePos('verb (transitive)')).toBe('verb');
    expect(normalizePos('noun')).toBe('noun');
    expect(normalizePos('adjective')).toBe('adjective');
    expect(normalizePos('adverb')).toBe('adverb');
    expect(normalizePos('phrase')).toBe('phrase');
    expect(normalizePos('determiner')).toBe('other');
    expect(normalizePos(undefined)).toBe('other');
  });
});

describe('parseClassifications', () => {
  it('parses items, lowercases, and folds pos', () => {
    const out = parseClassifications({
      items: [
        { surface: 'Quiero', lemma: 'Querer', pos: 'verb', gloss: 'to want' },
        { surface: 'casa', lemma: 'casa', pos: 'noun', gloss: 'house' },
      ],
    });
    expect(out).toEqual([
      { surface: 'quiero', lemma: 'querer', pos: 'verb', glossEn: 'to want' },
      { surface: 'casa', lemma: 'casa', pos: 'noun', glossEn: 'house' },
    ]);
  });

  it('falls back lemma→surface and skips entries with no surface', () => {
    const out = parseClassifications({ items: [{ surface: 'voy', pos: 'v' }, { lemma: 'x', pos: 'verb' }] });
    expect(out).toEqual([{ surface: 'voy', lemma: 'voy', pos: 'verb', glossEn: '' }]);
  });

  it('tolerates a bare array and junk', () => {
    expect(parseClassifications([{ surface: 'comer', pos: 'verb' }])).toHaveLength(1);
    expect(parseClassifications(null)).toEqual([]);
    expect(parseClassifications({})).toEqual([]);
  });
});

describe('parseVerbEntry', () => {
  it('parses a well-formed page and drops empty rows', () => {
    const entry = parseVerbEntry(
      {
        lemma: 'Querer',
        gloss: 'to want',
        regular: false,
        tables: [
          { label: 'Present', columns: ['', 'form'], rows: [['yo', 'quiero'], ['tú', 'quieres'], []] },
          { label: 'Empty', rows: [] },
        ],
        examples: [{ target: 'Quiero café.', en: 'I want coffee.' }, { target: '', en: 'skip' }],
        notes: ['Stem-changing e→ie.', ''],
      },
      'querer',
      'to want',
    );
    expect(entry).not.toBeNull();
    expect(entry!.lemma).toBe('querer');
    expect(entry!.glossEn).toBe('to want');
    expect(entry!.regular).toBe(false);
    expect(entry!.tables).toHaveLength(1);
    expect(entry!.tables[0].rows).toHaveLength(2);
    expect(entry!.examples).toHaveLength(1);
    expect(entry!.notes).toEqual(['Stem-changing e→ie.']);
  });

  it('returns null when there is nothing worth caching', () => {
    expect(parseVerbEntry({ lemma: 'x', tables: [], examples: [] }, 'x', 'y')).toBeNull();
    expect(parseVerbEntry(null, 'x', 'y')).toBeNull();
  });

  it('defaults regular to null and falls back lemma/gloss to the requested values', () => {
    const entry = parseVerbEntry({ examples: [{ target: 'a', en: 'b' }] }, 'estar', 'to be');
    expect(entry!.regular).toBeNull();
    expect(entry!.lemma).toBe('estar');
    expect(entry!.glossEn).toBe('to be');
  });
});
