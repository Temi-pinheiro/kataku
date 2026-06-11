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

  it('turns apostrophes into token breaks consistently', () => {
    expect(normalize("J'ai faim", 'fr')).toBe('j ai faim');
  });

  it('removes all whitespace and fullwidth punctuation for Mandarin', () => {
    expect(normalize('我 要 吃饭。', 'zh')).toBe('我要吃饭');
    expect(normalize('你好，世界！', 'zh')).toBe('你好世界');
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

  it('splits Mandarin into code points', () => {
    expect(tokenize('我要吃饭', 'zh')).toEqual(['我', '要', '吃', '饭']);
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

  it('matches Mandarin on hanzi regardless of spacing/punctuation', () => {
    expect(evaluate('我 要 吃饭。', ['我要吃饭'], 'zh').result).toBe('pass');
  });

  it('nears Mandarin per-character slips', () => {
    // 3 of 4 hanzi right → 0.75 < 0.8 → miss without pinyin fold
    expect(evaluate('我要吃面', ['我要吃饭'], 'zh').result).toBe('miss');
    // 4 of 5 right → 0.8 → near
    expect(evaluate('我想要吃面', ['我想要吃饭'], 'zh').result).toBe('near');
  });

  it('uses toneless pinyin fold as a secondary near check for zh', () => {
    // Homophone hanzi: same syllables, different characters.
    const fold = (s: string) => (s === '他要买马' || s === '他要买吗' ? 'ta yao mai ma' : s);
    const r = evaluate('他要买吗', ['他要买马'], 'zh', { pinyinFold: fold });
    expect(r.result).toBe('near');
  });

  it('never crashes on empty expected list', () => {
    expect(evaluate('anything', [], 'id').result).toBe('miss');
  });
});
