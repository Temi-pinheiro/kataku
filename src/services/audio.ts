import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Directory, Paths } from 'expo-file-system';
import { sttLocaleFor } from '../db';

/**
 * All teaching audio goes through here. Rendered pack clips play from
 * documentDirectory/packs/<lang>/audio/<key>.mp3; anything unrendered falls
 * back to the OS voice via expo-speech (plan §4.1 runtime fallback) — lower
 * quality, but it means lessons work before any pack has been rendered.
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

let configured = false;

export async function configureAudioSession(): Promise<void> {
  if (configured) return;
  configured = true;
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
}

export class TeachingAudio {
  private player: AudioPlayer | null = null;
  private available = new Map<string, string>(); // audio key → file uri
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
      // No rendered pack yet — device TTS carries the lesson.
    }
  }

  hasClip(key: string): boolean {
    return this.available.has(key);
  }

  /** Play one line; resolves when it finishes (or immediately on stop()). */
  async play(req: SpeakRequest): Promise<void> {
    this.cancelled = false;
    await configureAudioSession();
    const uri = req.key ? this.available.get(req.key) : undefined;
    if (uri) {
      return this.playFile(uri);
    }
    return this.speak(req);
  }

  private playFile(uri: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.player) {
        this.player = createAudioPlayer(uri);
      } else {
        this.player.replace(uri);
      }
      const sub = this.player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish || this.cancelled) {
          sub.remove();
          resolve();
        }
      });
      this.player.play();
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
    this.player?.pause();
    Speech.stop();
  }

  dispose(): void {
    this.stop();
    this.player?.remove();
    this.player = null;
  }
}

/** The mic-open tone (plan §3.1) — bundled, instant. */
const beepPlayer = () => createAudioPlayer(require('../../assets/beep.wav'));
let beep: AudioPlayer | null = null;

export async function playMicTone(): Promise<void> {
  await configureAudioSession();
  if (!beep) beep = beepPlayer();
  beep.seekTo(0);
  beep.play();
}
