import { describe, expect, it } from 'vitest';
import { moduleComplete, parseMarked, stripMarks, targetOnly, teacherLines } from './teacher-markup';

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

describe('teacherLines', () => {
  it('classifies verdict, plain, and cue lines and strips the markers', () => {
    const lines = teacherLines(
      '+ That\'s it.\nThe word for tea is «teh».\n> Now say: "I want tea."',
    );
    expect(lines).toEqual([
      { kind: 'verdict', grade: 'good', text: "That's it." },
      { kind: 'plain', text: 'The word for tea is «teh».' },
      { kind: 'cue', text: 'Now say: "I want tea."' },
    ]);
  });

  it('maps ~ to close and -/– to miss', () => {
    expect(teacherLines('~ Almost — one word off.')[0]).toEqual({
      kind: 'verdict',
      grade: 'close',
      text: 'Almost — one word off.',
    });
    expect(teacherLines('- Not quite.')[0]).toMatchObject({ kind: 'verdict', grade: 'miss' });
    expect(teacherLines('– Not quite.')[0]).toMatchObject({ kind: 'verdict', grade: 'miss' });
  });

  it('treats untagged text (old transcripts) as plain lines, skipping blanks', () => {
    expect(teacherLines('Good. Now say it.\n\nThe word is «mau».')).toEqual([
      { kind: 'plain', text: 'Good. Now say it.' },
      { kind: 'plain', text: 'The word is «mau».' },
    ]);
  });

  it('does not mistake hyphenated prose or bare symbols for verdicts', () => {
    expect(teacherLines('-makan is the verb')[0].kind).toBe('plain');
    expect(teacherLines('>')).toEqual([{ kind: 'plain', text: '>' }]);
  });

  it('classifies a "= " module-complete line and carries its recap', () => {
    const lines = teacherLines('+ Perfect.\n= You can now order coffee and say where you are.');
    expect(lines).toEqual([
      { kind: 'verdict', grade: 'good', text: 'Perfect.' },
      { kind: 'complete', recap: 'You can now order coffee and say where you are.' },
    ]);
  });

  it('does not mistake an equation or bare = for a completion', () => {
    expect(teacherLines('=')).toEqual([{ kind: 'plain', text: '=' }]);
    expect(teacherLines('2+2=4')[0].kind).toBe('plain');
  });
});

describe('moduleComplete', () => {
  it('returns the recap when the turn finished a module', () => {
    expect(moduleComplete('+ Nice.\n= You can want/can + a verb.')).toBe('You can want/can + a verb.');
  });

  it('is null for an ordinary mid-module turn', () => {
    expect(moduleComplete('The word for tea is «teh».\n> Now say: "I want tea."')).toBeNull();
  });
});
