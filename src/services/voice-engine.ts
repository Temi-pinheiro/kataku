import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Directory, Paths } from 'expo-file-system';
import { sttLocaleFor } from '../db';
import { AUDIO_MAP as AUDIO_ID } from '../generated/audio-map.id';
import { AUDIO_MAP as AUDIO_ES } from '../generated/audio-map.es';
import { AUDIO_MAP as AUDIO_FR } from '../generated/audio-map.fr';

/**
 * THE audio engine — sole speaker of sound in the app.
 *
 * Architecture rules (learned the hard way; do not regress):
 *
 * 1. ONE audio-session configuration for the app's entire life:
 *    record-capable + forced speaker. expo-audio expresses it as
 *    { allowsRecording: true, shouldRouteThroughEarpiece: false } and the
 *    recognizer is started with the matching iosCategory (playAndRecord +
 *    defaultToSpeaker, mode 'default'). Because BOTH native modules agree
 *    and the config never changes, there are no category flips — which were
 *    the root cause of earpiece routing, random silence, and post-feedback
 *    crashes (two modules racing over AVAudioSession on every phase change).
 *
 * 2. All playback is SERIALIZED through one queue — two clips can never
 *    race — and every clip carries a WATCHDOG: if a player never reports
 *    finishing (failed start, stalled session), the clip settles after its
 *    duration + margin (or a hard cap), so a lesson can stall for seconds
 *    at worst, never forever.
 *
 * 3. Nothing here ever throws. A clip can lose its sound; the lesson keeps
 *    going (plan hard rule: degrade gracefully, never block a session).
 */

const BUNDLED: Record<string, number> = { ...AUDIO_ID, ...AUDIO_ES, ...AUDIO_FR };

const CLIP_HARD_CAP_MS = 12_000;
const CLIP_MARGIN_MS = 2_000;

export interface SpeakRequest {
  /** Pack audio key, e.g. "id-f-p-004-a". Omit for dynamic lines. */
  key?: string;
  /** Spoken via device TTS when the key has no rendered file. */
  fallbackText: string;
  /** Pack language code ('id') or 'en'. */
  lang: string;
  /** Fallback-only speed hint; rendered slow clips are separate files. */
  slow?: boolean;
}

const TONES = {
  open: require('../../assets/beep.wav'),
  close: require('../../assets/beep-close.wav'),
} as const;

class VoiceEngine {
  private downloaded = new Map<string, string>(); // audio key → file uri
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;
  private cancelCurrent: (() => void) | null = null;
  private initialized = false;

  /** Call once at app start. Idempotent; never throws. */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true, // matches the recognizer's playAndRecord —
        shouldRouteThroughEarpiece: false, // — with the speaker forced. Never changes.
        interruptionMode: 'doNotMix',
      });
    } catch (e) {
      console.warn('voice-engine: audio mode init failed', e);
    }
  }

  /** Index a language's downloaded clips (bundled clips need no index). */
  async loadPackIndex(lang: string): Promise<void> {
    try {
      const dir = new Directory(Paths.document, 'packs', lang, 'audio');
      if (!dir.exists) return;
      for (const entry of dir.list()) {
        const m = entry.name.match(/^(.+)\.(mp3|wav|m4a)$/);
        if (m) this.downloaded.set(m[1], entry.uri);
      }
    } catch {
      // no downloaded pack — bundle + device TTS carry the lesson
    }
  }

  hasClip(key: string): boolean {
    return key in BUNDLED || this.downloaded.has(key);
  }

  /**
   * Speak one line. Serialized: concurrent callers queue up. Resolves when
   * the clip ends, is cancelled, or the watchdog fires. Never rejects.
   */
  play(req: SpeakRequest): Promise<void> {
    const gen = this.generation;
    const run = this.chain.then(async () => {
      if (gen !== this.generation) return; // cancelled while queued
      await this.init();
      try {
        const source = req.key !== undefined ? (BUNDLED[req.key] ?? this.downloaded.get(req.key)) : undefined;
        if (source !== undefined) {
          await this.playSource(source);
        } else {
          await this.speakFallback(req);
        }
      } catch (e) {
        console.warn('voice-engine: clip failed, continuing', req.key, e);
      }
    });
    this.chain = run;
    return run;
  }

  /**
   * Short UI tone: mic open / capture done. Deliberately NOT serialized —
   * a tone marks "now", it must not queue behind speech. Never throws.
   */
  tone(kind: 'open' | 'close'): void {
    try {
      const player = createAudioPlayer(TONES[kind]);
      const sub = player.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish) {
          sub.remove();
          try {
            player.remove();
          } catch {
            /* released */
          }
        }
      });
      player.play();
    } catch {
      // a missed tone never matters
    }
  }

  /** Cut whatever is playing or queued; pending play() calls resolve. */
  stop(): void {
    this.generation++;
    Speech.stop();
    this.cancelCurrent?.();
  }

  private playSource(source: string | number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const player = createAudioPlayer(source);
      const settle = () => {
        if (settled) return;
        settled = true;
        if (watchdog) clearTimeout(watchdog);
        this.cancelCurrent = null;
        sub.remove();
        try {
          player.pause();
          player.remove();
        } catch {
          /* already released */
        }
        resolve();
      };
      this.cancelCurrent = settle;
      const armWatchdog = (ms: number) => {
        if (watchdog) clearTimeout(watchdog);
        watchdog = setTimeout(settle, ms);
      };
      armWatchdog(CLIP_HARD_CAP_MS); // until we know the real duration
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          settle();
          return;
        }
        if (status.duration && status.duration > 0) {
          armWatchdog(status.duration * 1000 + CLIP_MARGIN_MS);
        }
      });
      try {
        player.play();
      } catch {
        settle();
      }
    });
  }

  private speakFallback(req: SpeakRequest): Promise<void> {
    if (!req.fallbackText.trim()) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        this.cancelCurrent = null;
        resolve();
      };
      this.cancelCurrent = () => {
        Speech.stop();
        settle();
      };
      const watchdog = setTimeout(settle, CLIP_HARD_CAP_MS);
      Speech.speak(req.fallbackText, {
        language: req.lang === 'en' ? 'en-US' : sttLocaleFor(req.lang),
        rate: req.slow ? 0.6 : 1.0,
        onDone: () => {
          clearTimeout(watchdog);
          settle();
        },
        onStopped: () => {
          clearTimeout(watchdog);
          settle();
        },
        onError: () => {
          clearTimeout(watchdog);
          settle();
        },
      });
    });
  }
}

/** The one and only instance. */
export const voiceEngine = new VoiceEngine();
