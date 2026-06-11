/**
 * The single speech-recognition interface (stretch contract #1). App code —
 * session screen, M0 spike, future conversation mode — talks only to this;
 * concrete recognizers live in src/services/stt/. Swapping or adding a
 * backend (cloud fallback, a future SpeechAnalyzer wrapper) must not touch
 * callers.
 */

export interface SttCallbacks {
  /** Streaming partial transcript. Also logged to spot false passes from recognizer auto-correct (plan §10). */
  onPartial?: (transcript: string) => void;
  /** Final transcript for the utterance; ends the LISTEN phase. */
  onFinal: (transcript: string) => void;
  /** Speech detected — drives the voice loop's EARLY_SPEECH event. */
  onSpeechStart?: () => void;
  /** Mic input level, normalized 0–1 (~10 Hz) — drives the live mic orb. */
  onVolume?: (level: number) => void;
  /** Recognition ended without a final result (silence, abort). */
  onEnd?: () => void;
  onError: (error: SttError) => void;
  /** Recorded utterance file (stretch contract #2: kept rolling 30 days). */
  onAudioFile?: (uri: string) => void;
}

export interface SttError {
  code: string;
  message: string;
}

export interface SttStartOptions {
  /** BCP-47 locale: id-ID, zh-CN, fr-FR, it-IT, es-ES. */
  locale: string;
  /** Prefer the on-device model when the locale has one (plan §4.2). */
  preferOnDevice?: boolean;
  /**
   * Keep recognizing across pauses; the caller decides when the utterance
   * ends (tap-to-finish / silence watchdog → stop()). Essential for
   * learners, who pause mid-sentence to construct — the OS's own
   * end-of-speech detection finalizes mid-thought.
   */
  continuous?: boolean;
  /**
   * Persist the utterance audio (16 kHz mono) for replay/tone-scoring.
   * NOTE: never feed expected answers as contextual hints — that inflates
   * the recognizer's auto-correct and creates false passes (plan §10).
   */
  recordAudio?: boolean;
}

export interface SttAvailability {
  available: boolean;
  onDevice: boolean;
}

export interface SpeechRecognizer {
  /** Human-readable backend name for the M0 findings table. */
  readonly name: string;
  availability(locale: string): Promise<SttAvailability>;
  /** Preflight the permission dialogs (called from the lesson intro, never mid-prompt). */
  requestPermissions(): Promise<boolean>;
  /** Opens the mic and recognizes one utterance. Resolves when started. */
  start(options: SttStartOptions, callbacks: SttCallbacks): Promise<void>;
  /** End-of-speech: finalize and deliver onFinal. */
  stop(): void;
  /** Cancel without a result. */
  abort(): void;
}
