import { describe, expect, it } from 'vitest';
import {
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

    s = run([{ type: 'AUDIO_DONE' }], s);
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

  it('offers exactly one retry, then moves on regardless', () => {
    let s = run(toFirstMiss);
    s = run([{ type: 'AUDIO_DONE' }], s);
    expect(s.phase).toBe('listen');
    expect(s.retriesUsed).toBe(1);

    // Retry also misses → feedback plays → done, no second retry.
    s = run([{ type: 'FINAL_TRANSCRIPT', transcript: 'selamat pagi' }, { type: 'AUDIO_DONE' }], s);
    expect(s.phase).toBe('done');
    expect(s.attempts).toHaveLength(2);
  });

  it('counts the first unaided attempt for mastery even if the retry passes', () => {
    let s = run(toFirstMiss);
    s = run(
      [{ type: 'AUDIO_DONE' }, { type: 'FINAL_TRANSCRIPT', transcript: 'saya mau makan sekarang' }, { type: 'AUDIO_DONE' }],
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
    s = run([{ type: 'AUDIO_DONE' }], s);
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
    s = run([{ type: 'AUDIO_DONE' }], s);
    expect(s.phase).toBe('done');
    expect(outcomeForMastery(s)).toBe('miss');
    expect(shouldRecycle(s)).toBe(true);
  });

  it('SLOWER queues the slow answer during feedback and after done', () => {
    let s = run([
      { type: 'START' },
      { type: 'AUDIO_DONE' },
      { type: 'THINK_TIMEOUT' },
      { type: 'FINAL_TRANSCRIPT', transcript: 'saya mau makan sekarang' },
    ]);
    s = run([{ type: 'SLOWER' }], s);
    expect(s.pendingAudio).toEqual(['confirm', 'answer', 'answer_slow']);

    s = run([{ type: 'AUDIO_DONE' }], s);
    expect(s.phase).toBe('done');
    s = run([{ type: 'SLOWER' }], s);
    expect(s.pendingAudio).toEqual(['answer_slow']);
  });

  it('ignores events that make no sense for the phase', () => {
    const idle = initialLoopState(PROMPT);
    expect(loopReducer(idle, { type: 'AUDIO_DONE' })).toBe(idle);
    const done = run([{ type: 'START' }, { type: 'AUDIO_DONE' }, { type: 'SKIP' }, { type: 'AUDIO_DONE' }]);
    expect(loopReducer(done, { type: 'FINAL_TRANSCRIPT', transcript: 'x' })).toBe(done);
  });
});
