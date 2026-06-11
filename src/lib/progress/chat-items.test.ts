import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../content/types';
import { chatItemId, isItemOfLanguage, resolveItemId, wordOfItem } from './chat-items';

const ITEMS: ContentItem[] = [
  {
    id: 'id-f-002',
    type: 'block',
    concept_en: 'to want',
    target_text: 'mau',
    romanization: null,
    teach_script: '',
    teach_segments: [{ text: 'mau', lang: 'target' }],
    audio: { teach: 'id-f-002-t' },
  },
  {
    id: 'id-f-014',
    type: 'block',
    concept_en: 'have to',
    target_text: 'harus',
    romanization: null,
    teach_script: '',
    teach_segments: [{ text: 'harus', lang: 'target' }],
    audio: { teach: 'id-f-014-t' },
  },
];

describe('resolveItemId', () => {
  it('maps a digested word onto the matching pack item', () => {
    expect(resolveItemId('id', 'Mau', ITEMS)).toBe('id-f-002');
    expect(resolveItemId('id', 'harus.', ITEMS)).toBe('id-f-014');
  });

  it('falls back to a synthetic chat id for pack-unknown words', () => {
    expect(resolveItemId('id', 'kopi', ITEMS)).toBe('chat:id:kopi');
  });

  it('normalizes the chat id word', () => {
    expect(chatItemId('id', '  Kopi! ')).toBe('chat:id:kopi');
  });
});

describe('isItemOfLanguage', () => {
  it('accepts both deck and chat id forms', () => {
    expect(isItemOfLanguage('id-f-002', 'id')).toBe(true);
    expect(isItemOfLanguage('chat:id:kopi', 'id')).toBe(true);
  });

  it('rejects other languages', () => {
    expect(isItemOfLanguage('es-f-001', 'id')).toBe(false);
    expect(isItemOfLanguage('chat:es:cafe', 'id')).toBe(false);
  });
});

describe('wordOfItem', () => {
  it('returns target_text for deck items and the embedded word for chat items', () => {
    expect(wordOfItem('id-f-002', ITEMS)).toBe('mau');
    expect(wordOfItem('chat:id:kopi', ITEMS)).toBe('kopi');
    expect(wordOfItem('id-f-999', ITEMS)).toBeNull();
  });
});
