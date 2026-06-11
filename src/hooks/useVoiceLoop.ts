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
import type { SpeechRecognizer } from '../lib/stt/types';
import { playMicTone, TeachingAudio, type SpeakRequest } from '../services/audio';
import { sttLocaleFor } from '../db';

const LISTEN_CAP_MS = 10_000; // §3.1

export interface VoiceLoopDeps {
  prompt: ContentPrompt;
  lang: LanguageCode;
  systemLines: CoursePack['system_lines'];
  audio: TeachingAudio;
  recognizer: SpeechRecognizer;
  thinkMs: number;
  onFinished: (finalState: LoopState) => void;
}

export interface VoiceLoopView {
  state: LoopState;
  /** Verbatim target-language transcript, partial or final (§3.1). */
  heard: string;
  send: (event: LoopEvent) => void;
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
  const listeningRef = useRef(false);
  const finishedRef = useRef(false);

  const send = useCallback((event: LoopEvent) => {
    setState((s) => loopReducer(s, event));
  }, []);

  // Start the loop once per prompt.
  useEffect(() => {
    send({ type: 'START' });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      depsRef.current.recognizer.abort();
      depsRef.current.audio.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps.prompt.id]);

  const startRecognizer = useCallback(async () => {
    if (listeningRef.current) return;
    listeningRef.current = true;
    setHeard('');
    const d = depsRef.current;
    await d.recognizer.start(
      { locale: sttLocaleFor(d.lang), preferOnDevice: true, recordAudio: true },
      {
        onSpeechStart: () => {
          if (stateRef.current.phase === 'think') send({ type: 'EARLY_SPEECH' });
        },
        onPartial: (t) => setHeard(t),
        onFinal: (t) => {
          listeningRef.current = false;
          setHeard(t);
          if (stateRef.current.phase === 'think') send({ type: 'EARLY_SPEECH' });
          send({ type: 'FINAL_TRANSCRIPT', transcript: t });
        },
        onEnd: () => {
          listeningRef.current = false;
          if (stateRef.current.phase === 'listen') send({ type: 'LISTEN_TIMEOUT' });
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
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Pending audio plays first, in order, then AUDIO_DONE.
    if (state.pendingAudio.length > 0) {
      let cancelled = false;
      (async () => {
        for (const kind of state.pendingAudio) {
          if (cancelled) return;
          await d.audio.play(speakRequestFor(kind, d));
        }
        if (!cancelled) send({ type: 'AUDIO_DONE' });
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
      case 'listen':
        startRecognizer(); // no-op if already running from the think window
        timerRef.current = setTimeout(() => {
          d.recognizer.stop(); // ask for a final; onEnd covers silence
        }, LISTEN_CAP_MS);
        break;
      case 'done':
        if (!finishedRef.current) {
          finishedRef.current = true;
          d.recognizer.abort();
          d.onFinished(stateRef.current);
        }
        break;
    }
    return undefined;
  }, [state.phase, state.pendingAudio, send, startRecognizer]);

  return { state, heard, send };
}
