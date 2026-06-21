import { describe, expect, it } from 'vitest';
import { normalize, tokenize } from './normalize';
import { editDistance, similarity } from './levenshtein';
import { evaluate } from './match';

describe('normalize', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalize('  Saya mau makan,  sekarang! ', 'id')).toBe('saya mau makan sekarang');
  });

  it('keeps diacritics', () => {
    expect(normalize('¿Dónde está el baño?', 'es')).toBe('dónde está el baño');
    expect(normalize('Ça va très bien.', 'fr')).toBe('ça va très bien');
  });

  it('keeps word-internal apostrophes and folds curly ones', () => {
    expect(normalize("J'ai faim", 'fr')).toBe("j'ai faim");
    expect(normalize('C’est bon.', 'fr')).toBe("c'est bon");
    expect(tokenize(normalize("Je n'ai pas faim", 'fr'), 'fr')).toEqual(["je", "n'ai", 'pas', 'faim']);
  });

  it('drops apostrophes that are not between letters', () => {
    expect(normalize("'quoted' word", 'fr')).toBe('quoted word');
  });

  it('round-trips already-normalized text unchanged', () => {
    const s = 'saya mau makan sekarang';
    expect(normalize(s, 'id')).toBe(s);
  });
});

describe('tokenize', () => {
  it('splits space-delimited languages on spaces', () => {
    expect(tokenize('saya mau makan', 'id')).toEqual(['saya', 'mau', 'makan']);
  });

  it('returns empty array for empty string', () => {
    expect(tokenize('', 'id')).toEqual([]);
  });
});

describe('levenshtein', () => {
  it('computes edit distance over tokens', () => {
    expect(editDistance(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1);
    expect(editDistance(['a', 'b'], ['a', 'b', 'c'])).toBe(1);
    expect(editDistance([], ['a'])).toBe(1);
  });

  it('similarity is 1 for identical and for two empties', () => {
    expect(similarity(['a'], ['a'])).toBe(1);
    expect(similarity([], [])).toBe(1);
  });
});

describe('evaluate', () => {
  const expected = ['saya mau makan sekarang', 'aku mau makan sekarang'];

  it('passes an exact match', () => {
    const r = evaluate('Saya mau makan sekarang.', expected, 'id');
    expect(r.result).toBe('pass');
    expect(r.similarity).toBe(1);
  });

  it('passes an accepted variant', () => {
    expect(evaluate('aku mau makan sekarang', expected, 'id').result).toBe('pass');
  });

  it('nears a one-word slip in a 5-token sentence', () => {
    // 4/5 tokens right → similarity 0.8, exactly at threshold
    const r = evaluate('saya mau makan di sekarang', expected, 'id');
    expect(r.result).toBe('near');
    expect(r.similarity).toBeCloseTo(0.8);
  });

  it('misses below the threshold', () => {
    const r = evaluate('selamat pagi', expected, 'id');
    expect(r.result).toBe('miss');
    expect(r.similarity).toBeLessThan(0.8);
  });

  it('misses an empty or silent transcript', () => {
    expect(evaluate('', expected, 'id').result).toBe('miss');
    expect(evaluate('   ', expected, 'id').result).toBe('miss');
  });

  it('reports the closest variant for feedback', () => {
    const r = evaluate('aku mau makan', expected, 'id');
    expect(r.bestVariant).toBe('aku mau makan sekarang');
  });

  it('never crashes on empty expected list', () => {
    expect(evaluate('anything', [], 'id').result).toBe('miss');
  });
});
