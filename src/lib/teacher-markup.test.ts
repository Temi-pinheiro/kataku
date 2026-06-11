import { describe, expect, it } from 'vitest';
import { parseMarked, stripMarks, targetOnly } from './teacher-markup';

describe('parseMarked', () => {
  it('splits english narration from target spans in order', () => {
    const segs = parseMarked("The word for want is «mau». Now say: I want coffee.");
    expect(segs).toEqual([
      { target: false, text: 'The word for want is ' },
      { target: true, text: 'mau' },
      { target: false, text: '. Now say: I want coffee.' },
    ]);
  });

  it('handles multiple spans and drops empty segments', () => {
    const segs = parseMarked('«saya» means I. «mau» means want. Together: «saya mau kopi».');
    expect(segs.filter((s) => s.target).map((s) => s.text)).toEqual(['saya', 'mau', 'saya mau kopi']);
  });

  it('treats an unclosed mark as target to the end', () => {
    expect(parseMarked('Say: «saya mau kopi')).toEqual([
      { target: false, text: 'Say: ' },
      { target: true, text: 'saya mau kopi' },
    ]);
  });

  it('returns one english segment for unmarked text', () => {
    expect(parseMarked('Welcome back. Ready?')).toEqual([{ target: false, text: 'Welcome back. Ready?' }]);
  });
});

describe('targetOnly', () => {
  it('joins target spans with sentence beats and final punctuation', () => {
    expect(targetOnly("It's «mau». «Mau». Then «saya mau kopi», okay?")).toBe('mau.\nMau.\nsaya mau kopi.');
  });

  it('keeps existing terminal punctuation', () => {
    expect(targetOnly('Ask it: «kamu mau makan?»')).toBe('kamu mau makan?');
  });

  it('is empty for english-only messages (no audio to play)', () => {
    expect(targetOnly('Great progress today — see you tomorrow.')).toBe('');
  });
});

describe('stripMarks', () => {
  it('removes guillemets only', () => {
    expect(stripMarks('Say «saya mau kopi» now.')).toBe('Say saya mau kopi now.');
  });
});
