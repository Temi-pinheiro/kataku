import { describe, expect, it } from 'vitest';
import { formatUsd, isOverCap, monthToDateUsd, spend, type SpendEvent } from './meter';

const NOW = new Date('2026-06-11T08:00:00Z');

describe('spend', () => {
  it('computes cost from the price table', () => {
    const e = spend('openai:stt_fallback', 0.5, NOW); // half a minute
    expect(e.costUsd).toBeCloseTo(0.0015);
    expect(e.provider).toBe('openai');
    expect(e.feature).toBe('stt_fallback');
    expect(e.unit).toBe('minute');
  });

  it('throws on unpriced keys so unknown spend can never pass silently', () => {
    expect(() => spend('mystery:thing', 1, NOW)).toThrow(/No price configured/);
  });
});

describe('monthToDateUsd / isOverCap', () => {
  const events: SpendEvent[] = [
    { at: '2026-05-30T10:00:00Z', provider: 'openai', feature: 'x', units: 1, unit: 'minute', costUsd: 5 },
    { at: '2026-06-02T10:00:00Z', provider: 'openai', feature: 'x', units: 1, unit: 'minute', costUsd: 0.4 },
    { at: '2026-06-10T10:00:00Z', provider: 'anthropic', feature: 'y', units: 1, unit: 'call', costUsd: 0.03 },
  ];

  it('sums only the current month', () => {
    expect(monthToDateUsd(events, NOW)).toBeCloseTo(0.43);
  });

  it('trips the soft cap at the boundary', () => {
    expect(isOverCap(events, 0.43, NOW)).toBe(true);
    expect(isOverCap(events, 0.44, NOW)).toBe(false);
  });
});

describe('formatUsd', () => {
  it('formats for the review line', () => {
    expect(formatUsd(0.43)).toBe('$0.43');
    expect(formatUsd(0)).toBe('$0.00');
  });
});
