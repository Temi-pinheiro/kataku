import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Directory, Paths } from 'expo-file-system';
import { sttLocaleFor } from '../db';
import { AUDIO_MAP as AUDIO_ID } from '../generated/audio-map.id';
import { AUDIO_MAP as AUDIO_ES } from '../generated/audio-map.es';
import { AUDIO_MAP as AUDIO_FR } from '../generated/audio-map.fr';

/** Clips bundled into the binary at build time (regenerated per render). */
const BUNDLED: Record<string, number> = { ...AUDIO_ID, ...AUDIO_ES, ...AUDIO_FR };

/**
 * All teaching audio goes through here. Rendered pack clips play from the
 * bundle (or documentDirectory/packs for downloaded packs); anything
 * unrendered falls back to the OS voice via expo-speech — per segment, in
 * the segment's own locale.
 */

export interface SpeakRequest {
  /** Pack audio key, e.g. "id-f-p-004-a". Omit for dynamic lines. */
  key?: string;
  /** Spoken via device TTS when the key has no rendered file. */
  fallbackText: string;
  /** Pack language code ('id') or 'en' for cues/system lines. */
  lang: string;
  /** Fallback-only speed hint; rendered slow clips are separate files. */
  slow?: boolean;
}

/**
 * Re-asserted before EVERY clip, not once: expo-speech-recognition flips
 * the session to playAndRecord while listening, and iOS can leave the
 * route on the earpiece afterwards. allowsRecording stays false here —
 * true is what turns playback into a phone call (receiver routing).
 */
async function assertSpeakerRoute(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  });
}

export const configureAudioSession = assertSpeakerRoute;

export class TeachingAudio {
  private available = new Map<string, string>(); // audio key → file uri
  private settleActive: (() => void) | null = null;
  private cancelled = false;

  /** Index a language's rendered clips once per app start. */
  async loadPackIndex(lang: string): Promise<void> {
    try {
      const dir = new Directory(Paths.document, 'packs', lang, 'audio');
      if (!dir.exists) return;
      for (const entry of dir.list()) {
        const m = entry.name.match(/^(.+)\.(mp3|wav|m4a)$/);
        if (m) this.available.set(m[1], entry.uri);
      }
    } catch {
      // No downloaded pack — bundle and device TTS carry the lesson.
    }
  }

  hasClip(key: string): boolean {
    return this.available.has(key) || key in BUNDLED;
  }

  /** Play one line; resolves when it finishes (or immediately on stop()). */
  async play(req: SpeakRequest): Promise<void> {
    this.cancelled = false;
    await assertSpeakerRoute();
    const bundled = req.key ? BUNDLED[req.key] : undefined;
    if (bundled !== undefined) {
      return this.playFile(bundled);
    }
    const uri = req.key ? this.available.get(req.key) : undefined;
    if (uri) {
      return this.playFile(uri);
    }
    return this.speak(req);
  }

  /**
   * A fresh player per clip: a reused player's status listener can deliver
   * the PREVIOUS clip's didJustFinish before the new source starts, which
   * resolved instantly and silently — the "resumed lessons say nothing" bug.
   */
  private playFile(uri: string | number): Promise<void> {
    return new Promise((resolve) => {
      const player = createAudioPlayer(uri);
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        this.settleActive = null;
        sub.remove();
        try {
          player.pause();
          player.remove();
        } catch {
          // already torn down
        }
        resolve();
      };
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish || this.cancelled) settle();
      });
      this.settleActive = settle;
      player.play();
    });
  }

  private speak(req: SpeakRequest): Promise<void> {
    return new Promise((resolve) => {
      Speech.speak(req.fallbackText, {
        language: req.lang === 'en' ? 'en-US' : sttLocaleFor(req.lang),
        rate: req.slow ? 0.6 : 1.0,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  }

  stop(): void {
    this.cancelled = true;
    Speech.stop();
    this.settleActive?.();
  }

  dispose(): void {
    this.stop();
  }
}

// ---- mic tones (plan §3.1: a soft tone signals "mic open") ----

const TONES = {
  open: require('../../assets/beep.wav'),
  close: require('../../assets/beep-close.wav'),
} as const;

const tonePlayers: Partial<Record<keyof typeof TONES, AudioPlayer>> = {};

/** open = mic is hot, say it · close = got it, capture ended. */
export async function playMicTone(kind: 'open' | 'close' = 'open'): Promise<void> {
  await assertSpeakerRoute();
  if (!tonePlayers[kind]) tonePlayers[kind] = createAudioPlayer(TONES[kind]);
  const player = tonePlayers[kind]!;
  player.seekTo(0);
  player.play();
}
