import { evaluate, type Evaluation, type EvaluateOptions, type LanguageCode, type MatchResult } from '../matching';

/**
 * The per-prompt voice loop (plan §3.1):
 *
 *   PLAY_CUE → THINK_WINDOW → LISTEN → EVALUATE → FEEDBACK → done
 *
 * Implemented as a pure reducer. Side effects are expressed as data: each
 * state carries `pendingAudio`, the clips the shell must play before sending
 * AUDIO_DONE. Evaluation happens synchronously inside the FINAL_TRANSCRIPT
 * transition, so there is no separate EVALUATE state.
 */

export type LoopPhase = 'idle' | 'play_cue' | 'think' | 'listen' | 'feedback' | 'done';

/**
 * What to play. cue/answer/answer_slow/decompose resolve to the prompt's
 * rendered clips; confirm/almost are per-language system clips ("Yes —",
 * "Almost — listen:"). decompose falls back to device TTS if unrendered.
 */
export type AudioKind = 'cue' | 'answer' | 'answer_slow' | 'decompose' | 'confirm' | 'almost';

export type FeedbackKind = MatchResult | 'skip';

export interface PromptSpec {
  id: string;
  lang: LanguageCode;
  expected: readonly string[];
  /** Components recycled/exercised by this prompt (item ids). */
  components: readonly string[];
  hasDecompose: boolean;
}

export interface Attempt {
  transcript: string;
  evaluation: Evaluation;
}

export interface LoopState {
  phase: LoopPhase;
  prompt: PromptSpec;
  pendingAudio: readonly AudioKind[];
  attempts: readonly Attempt[];
  retriesUsed: number;
  feedbackKind: FeedbackKind | null;
  skipped: boolean;
}

export type LoopEvent =
  | { type: 'START' }
  | { type: 'AUDIO_DONE' }
  | { type: 'THINK_TIMEOUT' }
  | { type: 'TAP_TO_ANSWER' }
  | { type: 'EARLY_SPEECH' }
  | { type: 'FINAL_TRANSCRIPT'; transcript: string }
  | { type: 'LISTEN_TIMEOUT' }
  | { type: 'REPEAT' }
  | { type: 'SLOWER' }
  | { type: 'SKIP' };

export const MAX_RETRIES = 1;

export function initialLoopState(prompt: PromptSpec): LoopState {
  return {
    phase: 'idle',
    prompt,
    pendingAudio: [],
    attempts: [],
    retriesUsed: 0,
    feedbackKind: null,
    skipped: false,
  };
}

function feedbackAudio(result: MatchResult, prompt: PromptSpec): AudioKind[] {
  switch (result) {
    case 'pass':
      return ['confirm', 'answer'];
    case 'near':
      return ['almost', 'answer'];
    case 'miss':
      // Decompose into blocks, then the answer slowly, then at speed (§3.1).
      return prompt.hasDecompose ? ['decompose', 'answer_slow', 'answer'] : ['answer_slow', 'answer'];
  }
}

export function loopReducer(state: LoopState, event: LoopEvent, opts: EvaluateOptions = {}): LoopState {
  switch (state.phase) {
    case 'idle':
      if (event.type === 'START') {
        return { ...state, phase: 'play_cue', pendingAudio: ['cue'] };
      }
      return state;

    case 'play_cue':
      if (event.type === 'AUDIO_DONE') {
        return { ...state, phase: 'think', pendingAudio: [] };
      }
      return state;

    case 'think':
      switch (event.type) {
        case 'THINK_TIMEOUT':
        case 'TAP_TO_ANSWER':
        case 'EARLY_SPEECH':
          return { ...state, phase: 'listen' };
        case 'REPEAT':
          return { ...state, phase: 'play_cue', pendingAudio: ['cue'] };
        case 'SKIP':
          return skipToAnswer(state);
        default:
          return state;
      }

    case 'listen':
      switch (event.type) {
        case 'FINAL_TRANSCRIPT':
        case 'LISTEN_TIMEOUT': {
          const transcript = event.type === 'FINAL_TRANSCRIPT' ? event.transcript : '';
          const evaluation = evaluate(transcript, state.prompt.expected, state.prompt.lang, opts);
          return {
            ...state,
            phase: 'feedback',
            attempts: [...state.attempts, { transcript, evaluation }],
            feedbackKind: evaluation.result,
            pendingAudio: feedbackAudio(evaluation.result, state.prompt),
          };
        }
        case 'REPEAT':
          return { ...state, phase: 'play_cue', pendingAudio: ['cue'] };
        case 'SKIP':
          return skipToAnswer(state);
        default:
          return state;
      }

    case 'feedback':
      switch (event.type) {
        case 'AUDIO_DONE': {
          const retryable =
            !state.skipped &&
            (state.feedbackKind === 'near' || state.feedbackKind === 'miss') &&
            state.retriesUsed < MAX_RETRIES;
          if (retryable) {
            // One retry, then move on regardless (§3.1).
            return { ...state, phase: 'listen', retriesUsed: state.retriesUsed + 1, pendingAudio: [] };
          }
          return { ...state, phase: 'done', pendingAudio: [] };
        }
        case 'SLOWER':
          return { ...state, pendingAudio: [...state.pendingAudio, 'answer_slow'] };
        default:
          return state;
      }

    case 'done':
      if (event.type === 'SLOWER') {
        return { ...state, pendingAudio: ['answer_slow'] };
      }
      if (event.type === 'REPEAT') {
        return { ...state, pendingAudio: ['answer'] };
      }
      if (event.type === 'AUDIO_DONE') {
        return { ...state, pendingAudio: [] };
      }
      return state;
  }
}

function skipToAnswer(state: LoopState): LoopState {
  return {
    ...state,
    phase: 'feedback',
    skipped: true,
    feedbackKind: 'skip',
    pendingAudio: ['answer'],
  };
}

/**
 * What mastery records for this prompt's components: the first unaided
 * attempt. A successful retry is pedagogy, not evidence — the wobble still
 * gets the item recycled sooner. Skips and silence count as misses.
 */
export function outcomeForMastery(state: LoopState): MatchResult {
  const first = state.attempts[0];
  return first ? first.evaluation.result : 'miss';
}

/** What the learner heard last — drives the on-screen verbatim transcript (§3.1). */
export function lastAttempt(state: LoopState): Attempt | null {
  return state.attempts.length > 0 ? state.attempts[state.attempts.length - 1] : null;
}

/** A prompt whose first attempt wasn't a clean pass goes back into the pool sooner. */
export function shouldRecycle(state: LoopState): boolean {
  return outcomeForMastery(state) !== 'pass';
}
