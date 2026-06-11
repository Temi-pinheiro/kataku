import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentPrompt, CoursePack } from '../lib/content/types';
import type { LanguageCode } from '../lib/matching';
import {
  initialLoopState,
  loopReducer,
  type AudioKind,
  type LoopEvent,
  type LoopState,
} from '../lib/voice-loop/machine';
import { playMicTone, TeachingAudio, type SpeakRequest } from '../services/audio';
import type { SpeechRecognizer } from '../lib/stt/types';
import { sttLocaleFor } from '../db';

/**
 * Listening is learner-paced (the M0 lesson test failed partly on this):
 * the recognizer runs in continuous mode and the utterance ends only on
 * tap-to-finish, ~2.6s of transcript silence after speech began, or the
 * hard cap — never on the OS's aggressive end-of-speech detection, because
 * beginners pause mid-sentence to construct (that pause is the method).
 */
const LISTEN_CAP_MS = 12_000;
const SILENCE_AFTER_SPEECH_MS = 2_600;
const SILENCE_POLL_MS = 250;

export interface VoiceLoopDeps {
  prompt: ContentPrompt;
  lang: LanguageCode;
  systemLines: CoursePack['system_lines'];
  audio: TeachingAudio;
  recognizer: SpeechRecognizer;
  thinkMs: number;
  /** Live mic level 0–1 (~10 Hz) for the orb. */
  onVolume?: (level: number) => void;
  onFinished: (finalState: LoopState) => void;
}

export interface VoiceLoopView {
  state: LoopState;
  /** Verbatim target-language transcript, partial or final (§3.1). */
  heard: string;
  send: (event: LoopEvent) => void;
  /** Tap-to-finish: "I'm done talking" — finalizes the utterance. */
  finishListening: () => void;
}

function speakRequestFor(kind: AudioKind, deps: VoiceLoopDeps): SpeakRequest {
  const { prompt, lang, systemLines } = deps;
  switch (kind) {
    case 'cue':
      return { key: prompt.audio.cue, fallbackText: prompt.cue_en, lang: 'en' };
    case 'answer':
      return { key: prompt.audio.answer, fallbackText: prompt.expected[0], lang };
    case 'answer_slow':
      return { key: prompt.audio.answer_slow, fallbackText: prompt.expected[0], lang, slow: true };
    case 'decompose':
      return { key: prompt.audio.decompose, fallbackText: prompt.decompose_script ?? '', lang: 'en' };
    case 'confirm':
      return { key: systemLines.confirm?.audio, fallbackText: systemLines.confirm?.text ?? 'Yes —', lang: 'en' };
    case 'almost':
      return { key: systemLines.almost?.audio, fallbackText: systemLines.almost?.text ?? 'Almost — listen:', lang: 'en' };
  }
}

export function useVoiceLoop(deps: VoiceLoopDeps): VoiceLoopView {
  const [state, setState] = useState<LoopState>(() =>
    initialLoopState({
      id: deps.prompt.id,
      lang: deps.lang,
      expected: deps.prompt.expected,
      components: deps.prompt.components,
      hasDecompose: Boolean(deps.prompt.decompose_script),
    }),
  );
  const [heard, setHeard] = useState('');

  const stateRef = useRef(state);
  stateRef.current = state;
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeechAtRef = useRef<number | null>(null);
  const listeningRef = useRef(false);
  const finishedRef = useRef(false);

  const send = useCallback((event: LoopEvent) => {
    setState((s) => loopReducer(s, event));
  }, []);

  const clearWatchdogs = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (silenceRef.current) clearInterval(silenceRef.current);
    timerRef.current = null;
    silenceRef.current = null;
  }, []);

  const finishListening = useCallback(() => {
    depsRef.current.recognizer.stop(); // delivers onFinal with what was said
  }, []);

  /** Hard mic close — the mic is never open while the tutor speaks. */
  const stopMic = useCallback(() => {
    depsRef.current.recognizer.abort();
    listeningRef.current = false;
    depsRef.current.onVolume?.(0);
  }, []);

  // Start the loop once per prompt.
  useEffect(() => {
    send({ type: 'START' });
    return () => {
      clearWatchdogs();
      depsRef.current.recognizer.abort();
      depsRef.current.audio.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps.prompt.id]);

  const startRecognizer = useCallback(async () => {
    if (listeningRef.current) return;
    listeningRef.current = true;
    lastSpeechAtRef.current = null;
    setHeard('');
    const d = depsRef.current;
    await d.recognizer.start(
      { locale: sttLocaleFor(d.lang), preferOnDevice: true, continuous: true, recordAudio: true },
      {
        onSpeechStart: () => {
          lastSpeechAtRef.current = Date.now();
          if (stateRef.current.phase === 'think') send({ type: 'EARLY_SPEECH' });
        },
        onVolume: (level) => d.onVolume?.(level),
        onPartial: (t) => {
          if (t.trim().length > 0) lastSpeechAtRef.current = Date.now();
          setHeard(t);
          if (stateRef.current.phase === 'think') send({ type: 'EARLY_SPEECH' });
        },
        onFinal: (t) => {
          listeningRef.current = false;
          setHeard(t);
          void playMicTone('close'); // capture ended — you can stop talking
          if (stateRef.current.phase === 'think') send({ type: 'EARLY_SPEECH' });
          send({ type: 'FINAL_TRANSCRIPT', transcript: t });
        },
        onEnd: () => {
          listeningRef.current = false;
          if (stateRef.current.phase === 'listen') {
            void playMicTone('close');
            send({ type: 'LISTEN_TIMEOUT' });
          }
        },
        onError: () => {
          listeningRef.current = false;
          if (stateRef.current.phase === 'listen' || stateRef.current.phase === 'think') {
            send({ type: 'LISTEN_TIMEOUT' });
          }
        },
      },
    );
  }, [send]);

  // React to phase / pending-audio changes by performing the side effects.
  useEffect(() => {
    const d = depsRef.current;
    clearWatchdogs();

    // Pending audio plays first, in order, then AUDIO_DONE. Close the mic
    // before any tutor audio (REPEAT/SKIP can arrive with the mic hot) —
    // otherwise the speaker output leaks into the next transcript.
    if (state.pendingAudio.length > 0) {
      stopMic();
      let cancelled = false;
      (async () => {
        try {
          for (const kind of state.pendingAudio) {
            if (cancelled) return;
            await d.audio.play(speakRequestFor(kind, d));
          }
        } finally {
          // AUDIO_DONE must fire no matter what — a failed clip can cost
          // its sound, never the lesson.
          if (!cancelled) send({ type: 'AUDIO_DONE' });
        }
      })();
      return () => {
        cancelled = true;
        d.audio.stop();
      };
    }

    switch (state.phase) {
      case 'think':
        // Mic opens with the tone; speaking early is allowed (§3.1).
        playMicTone();
        startRecognizer();
        timerRef.current = setTimeout(() => send({ type: 'THINK_TIMEOUT' }), d.thinkMs);
        break;
      case 'listen': {
        startRecognizer(); // no-op if already hot from the think window
        timerRef.current = setTimeout(() => finishListening(), LISTEN_CAP_MS);
        // Silence watchdog: armed only once speech has been heard.
        silenceRef.current = setInterval(() => {
          const last = lastSpeechAtRef.current;
          if (stateRef.current.phase !== 'listen' || last === null) return;
          if (Date.now() - last >= SILENCE_AFTER_SPEECH_MS) {
            clearWatchdogs();
            finishListening();
          }
        }, SILENCE_POLL_MS);
        break;
      }
      case 'done':
        if (!finishedRef.current) {
          finishedRef.current = true;
          d.recognizer.abort();
          d.onFinished(stateRef.current);
        }
        break;
    }
    return undefined;
  }, [state.phase, state.pendingAudio, send, startRecognizer, finishListening, clearWatchdogs, stopMic]);

  return { state, heard, send, finishListening };
}
