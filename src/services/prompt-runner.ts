import type { ContentPrompt, CoursePack } from '../lib/content/types';
import type { LanguageCode } from '../lib/matching';
import {
  initialLoopState,
  loopReducer,
  type AudioKind,
  type LoopEvent,
  type LoopState,
} from '../lib/voice-loop/machine';
import type { SpeechRecognizer } from '../lib/stt/types';
import { voiceEngine, type SpeakRequest } from './voice-engine';
import { sttLocaleFor } from '../db';

/**
 * Drives one prompt through the voice loop, imperatively. The pure reducer
 * decides WHAT happens; this runner performs the side effects in exactly
 * one place, sequentially — replacing the React-effect choreography whose
 * cleanup/re-run races were a standing source of double-plays and stalls.
 * React only renders snapshots via subscribe().
 *
 * Listening is learner-paced: continuous recognition; the utterance ends
 * on tap-to-finish, ~2.6s of post-speech transcript silence, or the cap —
 * never on the OS's own end-of-speech (beginners pause to construct).
 */

const LISTEN_CAP_MS = 12_000;
const SILENCE_AFTER_SPEECH_MS = 2_600;
const SILENCE_POLL_MS = 250;

export interface RunnerDeps {
  prompt: ContentPrompt;
  lang: LanguageCode;
  systemLines: CoursePack['system_lines'];
  recognizer: SpeechRecognizer;
  thinkMs: number;
  onVolume?: (level: number) => void;
  onFinished: (finalState: LoopState) => void;
}

export class PromptRunner {
  state: LoopState;
  heard = '';

  private deps: RunnerDeps;
  private listeners = new Set<() => void>();
  private disposed = false;
  private finished = false;
  private lastPhase: LoopState['phase'] = 'idle';
  private playingQueueId = 0;
  private queueActive = false;
  private micActive = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private silencePoll: ReturnType<typeof setInterval> | null = null;
  private lastSpeechAt: number | null = null;

  constructor(deps: RunnerDeps) {
    this.deps = deps;
    this.state = initialLoopState({
      id: deps.prompt.id,
      lang: deps.lang,
      expected: deps.prompt.expected,
      components: deps.prompt.components,
      hasDecompose: Boolean(deps.prompt.decompose_script),
    });
  }

  // ---- React bridge ----

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  // ---- public controls ----

  start(): void {
    this.send({ type: 'START' });
  }

  send(event: LoopEvent): void {
    if (this.disposed) return;
    const next = loopReducer(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.notify();
    this.pump();
  }

  /** Tap-to-finish: "I'm done talking." */
  finishListening(): void {
    this.deps.recognizer.stop(); // delivers onFinal with what was said
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
    this.playingQueueId++;
    this.closeMic();
    voiceEngine.stop();
    this.listeners.clear();
  }

  // ---- orchestration: one pump, runs after every state change ----

  private pump(): void {
    if (this.disposed) return;
    const s = this.state;

    // Queue emptied by an event (NEXT mid-audio, retry): cut playback FIRST,
    // before any phase-entry action can open the mic.
    if (s.pendingAudio.length === 0 && this.queueActive) {
      this.playingQueueId++;
      this.queueActive = false;
      voiceEngine.stop();
    }

    if (s.phase !== this.lastPhase) {
      this.onExitPhase(this.lastPhase);
      this.lastPhase = s.phase;
      this.onEnterPhase(s.phase);
    }

    // Audio queue: start it when there is one and we're not already on it.
    if (s.pendingAudio.length > 0 && !this.queueActive) {
      void this.runQueue([...s.pendingAudio]);
    }
  }

  private async runQueue(kinds: AudioKind[]): Promise<void> {
    const id = ++this.playingQueueId;
    this.queueActive = true;
    this.closeMic(); // the mic is never open while the tutor speaks
    for (const kind of kinds) {
      if (this.disposed || id !== this.playingQueueId) return;
      await voiceEngine.play(this.requestFor(kind));
    }
    if (this.disposed || id !== this.playingQueueId) return;
    this.queueActive = false;
    this.send({ type: 'AUDIO_DONE' });
  }

  private onEnterPhase(phase: LoopState['phase']): void {
    switch (phase) {
      case 'think':
        voiceEngine.tone('open'); // mic opens with the tone (§3.1)
        void this.openMic();
        this.timer = setTimeout(() => this.send({ type: 'THINK_TIMEOUT' }), this.deps.thinkMs);
        break;
      case 'listen':
        void this.openMic(); // no-op if already hot from the think window
        this.timer = setTimeout(() => this.finishListening(), LISTEN_CAP_MS);
        this.silencePoll = setInterval(() => {
          const last = this.lastSpeechAt;
          if (this.state.phase !== 'listen' || last === null) return;
          if (Date.now() - last >= SILENCE_AFTER_SPEECH_MS) {
            this.clearTimers();
            this.finishListening();
          }
        }, SILENCE_POLL_MS);
        break;
      case 'done':
        if (!this.finished) {
          this.finished = true;
          this.clearTimers();
          this.closeMic();
          this.deps.onFinished(this.state);
        }
        break;
      default:
        break;
    }
  }

  private onExitPhase(phase: LoopState['phase']): void {
    if (phase === 'think' || phase === 'listen') this.clearTimers();
  }

  // ---- mic ----

  private async openMic(): Promise<void> {
    if (this.micActive || this.disposed) return;
    this.micActive = true;
    this.lastSpeechAt = null;
    this.heard = '';
    this.notify();
    const d = this.deps;
    await d.recognizer.start(
      { locale: sttLocaleFor(d.lang), preferOnDevice: true, continuous: true, recordAudio: false },
      {
        onSpeechStart: () => {
          this.lastSpeechAt = Date.now();
          if (this.state.phase === 'think') this.send({ type: 'EARLY_SPEECH' });
        },
        onVolume: (level) => d.onVolume?.(level),
        onPartial: (t) => {
          if (t.trim().length > 0) this.lastSpeechAt = Date.now();
          this.heard = t;
          this.notify();
          if (this.state.phase === 'think') this.send({ type: 'EARLY_SPEECH' });
        },
        onFinal: (t) => {
          this.micActive = false;
          this.heard = t;
          this.notify();
          voiceEngine.tone('close'); // got it — capture ended
          if (this.state.phase === 'think') this.send({ type: 'EARLY_SPEECH' });
          this.send({ type: 'FINAL_TRANSCRIPT', transcript: t });
        },
        onEnd: () => {
          this.micActive = false;
          if (this.state.phase === 'listen') {
            voiceEngine.tone('close');
            this.send({ type: 'LISTEN_TIMEOUT' });
          }
        },
        onError: () => {
          this.micActive = false;
          if (this.state.phase === 'listen' || this.state.phase === 'think') {
            this.send({ type: 'LISTEN_TIMEOUT' });
          }
        },
      },
    );
  }

  private closeMic(): void {
    if (!this.micActive) return;
    this.micActive = false;
    this.deps.recognizer.abort();
    this.deps.onVolume?.(0);
  }

  private clearTimers(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.silencePoll) clearInterval(this.silencePoll);
    this.timer = null;
    this.silencePoll = null;
  }

  private requestFor(kind: AudioKind): SpeakRequest {
    const { prompt, systemLines } = this.deps;
    switch (kind) {
      case 'cue':
        return { key: prompt.audio.cue };
      case 'answer':
        return { key: prompt.audio.answer };
      case 'answer_slow':
        return { key: prompt.audio.answer_slow };
      case 'decompose':
        return { key: prompt.audio.decompose };
      case 'confirm':
        return { key: systemLines.confirm?.audio };
      case 'almost':
        return { key: systemLines.almost?.audio };
    }
  }
}
