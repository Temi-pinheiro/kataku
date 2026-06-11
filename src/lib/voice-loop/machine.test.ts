import { describe, expect, it } from 'vitest';
import {
  canRetry,
  initialLoopState,
  loopReducer,
  outcomeForMastery,
  shouldRecycle,
  type LoopEvent,
  type LoopState,
  type PromptSpec,
} from './machine';

const PROMPT: PromptSpec = {
  id: 'id-f-p-004',
  lang: 'id',
  expected: ['saya mau makan sekarang', 'aku mau makan sekarang'],
  components: ['id-f-001', 'id-f-002', 'id-f-003'],
  hasDecompose: true,
};

function run(events: LoopEvent[], from?: LoopState): LoopState {
  return events.reduce((s, e) => loopReducer(s, e), from ?? initialLoopState(PROMPT));
}

describe('happy path', () => {
  it('walks PLAY_CUE → THINK → LISTEN → FEEDBACK → done on a pass', () => {
    let s = run([{ type: 'START' }]);
    expect(s.phase).toBe('play_cue');
    expect(s.pendingAudio).toEqual(['cue']);

    s = run([{ type: 'AUDIO_DONE' }], s);
    expect(s.phase).toBe('think');

    s = run([{ type: 'THINK_TIMEOUT' }], s);
    expect(s.phase).toBe('listen');

    s = run([{ type: 'FINAL_TRANSCRIPT', transcript: 'Saya mau makan sekarang.' }], s);
    expect(s.phase).toBe('feedback');
    expect(s.feedbackKind).toBe('pass');
    expect(s.pendingAudio).toEqual(['confirm', 'answer']);

    // Result audio ends → HOLD in feedback; the learner advances.
    s = run([{ type: 'AUDIO_DONE' }], s);
    expect(s.phase).toBe('feedback');
    expect(s.pendingAudio).toEqual([]);

    s = run([{ type: 'NEXT' }], s);
    expect(s.phase).toBe('done');
    expect(outcomeForMastery(s)).toBe('pass');
    expect(shouldRecycle(s)).toBe(false);
  });

  it('lets the learner answer early from the think window', () => {
    const s = run([{ type: 'START' }, { type: 'AUDIO_DONE' }, { type: 'EARLY_SPEECH' }]);
    expect(s.phase).toBe('listen');
  });
});

describe('miss and retry', () => {
  const toFirstMiss: LoopEvent[] = [
    { type: 'START' },
    { type: 'AUDIO_DONE' },
    { type: 'THINK_TIMEOUT' },
    { type: 'FINAL_TRANSCRIPT', transcript: 'selamat pagi' },
  ];

  it('plays decompose + slow + fast on a miss', () => {
    const s = run(toFirstMiss);
    expect(s.feedbackKind).toBe('miss');
    expect(s.pendingAudio).toEqual(['decompose', 'answer_slow', 'answer']);
  });

  it('offers exactly one learner-chosen retry, then only Next remains', () => {
    let s = run(toFirstMiss);
    expect(canRetry(s)).toBe(true);
    s = run([{ type: 'AUDIO_DONE' }, { type: 'TRY_AGAIN' }], s);
    expect(s.phase).toBe('listen');
    expect(s.retriesUsed).toBe(1);

    // Retry also misses → retry exhausted: TRY_AGAIN ignored, NEXT advances.
    s = run([{ type: 'FINAL_TRANSCRIPT', transcript: 'selamat pagi' }, { type: 'AUDIO_DONE' }], s);
    expect(s.phase).toBe('feedback');
    expect(canRetry(s)).toBe(false);
    const ignored = run([{ type: 'TRY_AGAIN' }], s);
    expect(ignored.phase).toBe('feedback');
    s = run([{ type: 'NEXT' }], s);
    expect(s.phase).toBe('done');
    expect(s.attempts).toHaveLength(2);
  });

  it('counts the first unaided attempt for mastery even if the retry passes', () => {
    let s = run(toFirstMiss);
    s = run(
      [
        { type: 'AUDIO_DONE' },
        { type: 'TRY_AGAIN' },
        { type: 'FINAL_TRANSCRIPT', transcript: 'saya mau makan sekarang' },
        { type: 'AUDIO_DONE' },
        { type: 'NEXT' },
      ],
      s,
    );
    expect(s.phase).toBe('done');
    expect(s.attempts[1].evaluation.result).toBe('pass');
    expect(outcomeForMastery(s)).toBe('miss');
    expect(shouldRecycle(s)).toBe(true);
  });

  it('treats listen timeout (silence) as a miss attempt', () => {
    const s = run([{ type: 'START' }, { type: 'AUDIO_DONE' }, { type: 'THINK_TIMEOUT' }, { type: 'LISTEN_TIMEOUT' }]);
    expect(s.feedbackKind).toBe('miss');
    expect(s.attempts[0].transcript).toBe('');
  });

  it('skips decompose audio when the prompt has none', () => {
    const s = run(
      [
        { type: 'START' },
        { type: 'AUDIO_DONE' },
        { type: 'THINK_TIMEOUT' },
        { type: 'FINAL_TRANSCRIPT', transcript: 'selamat pagi' },
      ],
      initialLoopState({ ...PROMPT, hasDecompose: false }),
    );
    expect(s.pendingAudio).toEqual(['answer_slow', 'answer']);
  });
});

describe('near-miss', () => {
  it('plays "almost" + answer and allows one retry', () => {
    let s = run([
      { type: 'START' },
      { type: 'AUDIO_DONE' },
      { type: 'THINK_TIMEOUT' },
      { type: 'FINAL_TRANSCRIPT', transcript: 'saya mau makan di sekarang' },
    ]);
    expect(s.feedbackKind).toBe('near');
    expect(s.pendingAudio).toEqual(['almost', 'answer']);
    expect(canRetry(s)).toBe(true);
    s = run([{ type: 'AUDIO_DONE' }, { type: 'TRY_AGAIN' }], s);
    expect(s.phase).toBe('listen');
  });
});

describe('controls', () => {
  it('REPEAT replays the cue from the think window and returns to think', () => {
    let s = run([{ type: 'START' }, { type: 'AUDIO_DONE' }, { type: 'REPEAT' }]);
    expect(s.phase).toBe('play_cue');
    expect(s.pendingAudio).toEqual(['cue']);
    s = run([{ type: 'AUDIO_DONE' }], s);
    expect(s.phase).toBe('think');
  });

  it('SKIP reveals the answer, records a miss, and never retries', () => {
    let s = run([{ type: 'START' }, { type: 'AUDIO_DONE' }, { type: 'SKIP' }]);
    expect(s.phase).toBe('feedback');
    expect(s.feedbackKind).toBe('skip');
    expect(s.pendingAudio).toEqual(['answer']);
    expect(canRetry(s)).toBe(false);
    s = run([{ type: 'AUDIO_DONE' }, { type: 'NEXT' }], s);
    expect(s.phase).toBe('done');
    expect(outcomeForMastery(s)).toBe('miss');
    expect(shouldRecycle(s)).toBe(true);
  });

  it('SLOWER waits for the queue, then replays the slow answer', () => {
    let s = run([
      { type: 'START' },
      { type: 'AUDIO_DONE' },
      { type: 'THINK_TIMEOUT' },
      { type: 'FINAL_TRANSCRIPT', transcript: 'saya mau makan sekarang' },
    ]);
    // Ignored while the result audio is still playing (no queue restarts).
    s = run([{ type: 'SLOWER' }], s);
    expect(s.pendingAudio).toEqual(['confirm', 'answer']);

    s = run([{ type: 'AUDIO_DONE' }, { type: 'SLOWER' }], s);
    expect(s.phase).toBe('feedback');
    expect(s.pendingAudio).toEqual(['answer_slow']);
  });

  it('NEXT advances even while result audio is still playing (skip ahead)', () => {
    let s = run([
      { type: 'START' },
      { type: 'AUDIO_DONE' },
      { type: 'THINK_TIMEOUT' },
      { type: 'FINAL_TRANSCRIPT', transcript: 'saya mau makan sekarang' },
    ]);
    expect(s.pendingAudio.length).toBeGreaterThan(0);
    s = run([{ type: 'NEXT' }], s);
    expect(s.phase).toBe('done');
    expect(s.pendingAudio).toEqual([]);
  });

  it('ignores events that make no sense for the phase', () => {
    const idle = initialLoopState(PROMPT);
    expect(loopReducer(idle, { type: 'AUDIO_DONE' })).toBe(idle);
    const done = run([{ type: 'START' }, { type: 'AUDIO_DONE' }, { type: 'SKIP' }, { type: 'NEXT' }]);
    expect(done.phase).toBe('done');
    expect(loopReducer(done, { type: 'FINAL_TRANSCRIPT', transcript: 'x' })).toBe(done);
  });
});
