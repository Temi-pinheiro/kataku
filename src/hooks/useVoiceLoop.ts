import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ContentPrompt, CoursePack } from '../lib/content/types';
import type { LanguageCode } from '../lib/matching';
import type { LoopEvent, LoopState } from '../lib/voice-loop/machine';
import type { SpeechRecognizer } from '../lib/stt/types';
import { PromptRunner } from '../services/prompt-runner';

export interface VoiceLoopDeps {
  prompt: ContentPrompt;
  lang: LanguageCode;
  systemLines: CoursePack['system_lines'];
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

/**
 * Thin React bridge over PromptRunner — all orchestration lives in the
 * runner (one imperative owner, no effect races); this hook only
 * constructs it per prompt and subscribes to snapshots.
 */
export function useVoiceLoop(deps: VoiceLoopDeps): VoiceLoopView {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const [runner] = useState(
    () =>
      new PromptRunner({
        ...deps,
        // Late-bound so re-renders see fresh callbacks without re-creating the runner.
        onVolume: (v) => depsRef.current.onVolume?.(v),
        onFinished: (s) => depsRef.current.onFinished(s),
      }),
  );

  useEffect(() => {
    runner.start();
    return () => runner.dispose();
  }, [runner]);

  const state = useSyncExternalStore(runner.subscribe, () => runner.state);
  const heard = useSyncExternalStore(runner.subscribe, () => runner.heard);

  return {
    state,
    heard,
    send: (e) => runner.send(e),
    finishListening: () => runner.finishListening(),
  };
}
