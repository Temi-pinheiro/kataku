import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../content/types';
import type { MasteryState } from '../scheduler/scheduler';
import type { Lexeme, PartOfSpeech } from './types';
import { encounteredSurfaces, selectVerbs, unclassifiedSurfaces } from './select';

const M = (itemId: string, strength: number, lastSeenAt: string | null = '2026-06-01T00:00:00.000Z'): MasteryState => ({
  itemId,
  strength,
  lastSeenAt,
  dueAt: null,
});

const L = (surface: string, lemma: string, pos: PartOfSpeech, glossEn = ''): Lexeme => ({
  language: 'es',
  surface,
  lemma,
  pos,
  glossEn,
});

describe('selectVerbs', () => {
  it('dedupes conjugations into one entry per lemma, keeping the strongest signal', () => {
    const out = selectVerbs(
      [M('chat:es:quiero', 2), M('chat:es:quieres', 1)],
      [],
      [L('quiero', 'querer', 'verb', 'to want'), L('quieres', 'querer', 'verb', 'to want')],
      'es',
    );
    expect(out).toHaveLength(1);
    expect(out[0].lemma).toBe('querer');
    expect(out[0].familiarity).toBe(2);
    expect(out[0].surfaces).toHaveLength(2);
    expect(out[0].surfaces).toContain('quiero');
    expect(out[0].surfaces).toContain('quieres');
    expect(out[0].glossEn).toBe('to want');
  });

  it('keeps only verbs', () => {
    const out = selectVerbs([M('chat:es:casa', 3)], [], [L('casa', 'casa', 'noun', 'house')], 'es');
    expect(out).toEqual([]);
  });

  it('ignores other languages', () => {
    const out = selectVerbs([M('chat:id:makan', 3)], [], [L('makan', 'makan', 'verb', 'to eat')], 'es');
    expect(out).toEqual([]);
  });

  it('includes a shaky (strength 0) verb by default, but honors a raised threshold', () => {
    const mastery = [M('chat:es:hablar', 0)];
    const lex = [L('hablar', 'hablar', 'verb', 'to speak')];
    expect(selectVerbs(mastery, [], lex, 'es')).toHaveLength(1);
    expect(selectVerbs(mastery, [], lex, 'es', { minStrength: 2 })).toEqual([]);
  });

  it('sorts weakest-first, then most-recently-seen', () => {
    const out = selectVerbs(
      [
        M('chat:es:hablar', 3, '2026-06-01T00:00:00.000Z'),
        M('chat:es:comer', 0, '2026-06-02T00:00:00.000Z'),
        M('chat:es:beber', 0, '2026-06-03T00:00:00.000Z'),
      ],
      [],
      [
        L('hablar', 'hablar', 'verb'),
        L('comer', 'comer', 'verb'),
        L('beber', 'beber', 'verb'),
      ],
      'es',
    );
    expect(out.map((v) => v.lemma)).toEqual(['beber', 'comer', 'hablar']);
  });

  it('resolves deck (pack) items through their target_text', () => {
    const packItems: ContentItem[] = [
      {
        id: 'es-f-001',
        type: 'block',
        concept_en: 'I want',
        target_text: 'quiero',
        romanization: null,
        teach_script: '',
        teach_segments: [{ text: 'quiero', lang: 'target' }],
        audio: { teach: 'es-f-001-t' },
      },
    ];
    const out = selectVerbs([M('es-f-001', 2)], packItems, [L('quiero', 'querer', 'verb', 'to want')], 'es');
    expect(out).toHaveLength(1);
    expect(out[0].lemma).toBe('querer');
  });
});

describe('encounteredSurfaces', () => {
  it('aggregates the same surface from multiple mastery rows (max strength)', () => {
    const map = encounteredSurfaces([M('chat:es:quiero', 1), M('chat:es:quiero', 4)], [], 'es');
    expect(map.get('quiero')?.strength).toBe(4);
  });
});

describe('unclassifiedSurfaces', () => {
  it('returns only the surfaces not already classified', () => {
    const out = unclassifiedSurfaces(
      [M('chat:es:quiero', 2), M('chat:es:nuevo', 1)],
      [],
      [L('quiero', 'querer', 'verb', 'to want')],
      'es',
    );
    expect(out).toEqual(['nuevo']);
  });
});
