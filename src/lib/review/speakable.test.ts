import { describe, expect, it } from 'vitest';
import type { SentenceTemplate } from '../content/types';
import { roundSpeakable, speakableCount } from './speakable';

const TEMPLATE: SentenceTemplate = {
  id: 'modal-verb-time',
  shape: '[subject] [modal] [verb] [time?]',
  slots: [
    { name: 'subject', fillers: ['saya', 'kamu', 'dia'] },
    { name: 'modal', fillers: ['mau', 'bisa', 'harus'] },
    { name: 'verb', fillers: ['makan', 'pergi', 'tidur', 'bicara'] },
    { name: 'time', fillers: ['sekarang', 'besok'], optional: true },
  ],
};

describe('speakableCount', () => {
  it('multiplies mastered fillers per slot, +1 for optional omission', () => {
    const mastered = new Set(['saya', 'kamu', 'mau', 'makan', 'pergi', 'sekarang']);
    // 2 subjects × 1 modal × 2 verbs × (1 time + 1 omitted) = 8
    expect(speakableCount([TEMPLATE], mastered)).toBe(8);
  });

  it('contributes zero when a required slot has no mastered filler', () => {
    const mastered = new Set(['saya', 'makan', 'sekarang']); // no modal
    expect(speakableCount([TEMPLATE], mastered)).toBe(0);
  });

  it('sums across templates', () => {
    const two: SentenceTemplate = {
      id: 'greeting',
      shape: '[greeting]',
      slots: [{ name: 'greeting', fillers: ['selamat-pagi', 'selamat-malam'] }],
    };
    const mastered = new Set(['saya', 'mau', 'makan', 'selamat-pagi']);
    // template1: 1×1×1×(0+1)=1; template2: 1
    expect(speakableCount([TEMPLATE, two], mastered)).toBe(2);
  });

  it('makes combinatorial growth visible', () => {
    const week1 = new Set(['saya', 'mau', 'makan', 'pergi']);
    const week2 = new Set(['saya', 'kamu', 'dia', 'mau', 'bisa', 'harus', 'makan', 'pergi', 'tidur', 'bicara', 'sekarang', 'besok']);
    const before = speakableCount([TEMPLATE], week1);
    const after = speakableCount([TEMPLATE], week2);
    expect(after).toBe(3 * 3 * 4 * 3); // 108
    expect(after / before).toBeGreaterThan(10);
  });
});

describe('roundSpeakable', () => {
  it('keeps small numbers exact and rounds big ones to two significant figures', () => {
    expect(roundSpeakable(7)).toBe(7);
    expect(roundSpeakable(2437)).toBe(2400);
    expect(roundSpeakable(118)).toBe(120);
  });
});
