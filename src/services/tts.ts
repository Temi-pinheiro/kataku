import { Directory, File, Paths } from 'expo-file-system';
import { spend } from '../lib/cost/meter';
import { recordSpend } from '../db';
import { getElevenLabsKey, getElevenLabsVoice, getOpenAIKey } from './keys';

/**
 * Runtime TTS for dynamic teacher lines (owner rules: NO device-TTS
 * fallback ever; target-language-only input). Each line renders once and
 * is cached on disk — repeats are free and instant.
 *
 * Provider order (owner decision 2026-06-12): ElevenLabs first — the
 * bake-off winner and the SAME voice as the pre-rendered packs, so the
 * tutor has one voice everywhere — with OpenAI as automatic fallback
 * (~25× cheaper per char; flip the order in renderLine if cost bites).
 * No keys / no network → null; the UI stays text-only.
 */

const VOICE = 'coral';
const MODEL = 'gpt-4o-mini-tts';
const ELEVEN_MODEL = 'eleven_multilingual_v2';

const LANGUAGE_NAMES: Record<string, string> = {
  id: 'Indonesian',
  es: 'Spanish',
  fr: 'French',
};

/**
 * Locked to ONE language per clip (owner: never speak English, never
 * accent-switch). The input is target-language words/phrases only — one
 * per line — extracted from the «marked» teacher text.
 */
function instructionsFor(lang: string): string {
  const name = LANGUAGE_NAMES[lang] ?? 'the target language';
  return (
    `You are a native ${name} speaker and language teacher. The text is ${name} only — ` +
    `speak it with fully authentic native ${name} pronunciation, rhythm, and intonation, ` +
    `at a calm, clear teaching pace. Leave a distinct pause between lines. ` +
    `Never use an English accent or read anything as English.`
  );
}

function cacheDir(): Directory {
  return new Directory(Paths.cache, 'tts');
}

/** djb2 — stable, fast, fine for cache keys. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export async function ttsToFile(text: string, lang: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const dir = cacheDir();
    if (!dir.exists) dir.create({ intermediates: true });

    // ElevenLabs first: same voice as the rendered packs.
    const elevenKey = await getElevenLabsKey();
    const elevenVoice = await getElevenLabsVoice();
    if (elevenKey && elevenVoice) {
      const file = new File(dir, `${hash(`${ELEVEN_MODEL}|${elevenVoice}|${lang}|${trimmed}`)}.mp3`);
      if (file.exists) return file.uri;
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoice}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: trimmed,
            model_id: ELEVEN_MODEL,
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        },
      );
      if (res.ok) {
        file.write(new Uint8Array(await res.arrayBuffer()));
        await recordSpend(spend('elevenlabs:tts_runtime', trimmed.length / 1000, new Date())).catch(() => {});
        return file.uri;
      }
      console.warn('tts: elevenlabs failed, falling back to openai', res.status);
    }

    // OpenAI fallback (or primary when ElevenLabs isn't configured).
    const key = await getOpenAIKey();
    if (!key) return null;
    const file = new File(dir, `${hash(`${MODEL}|${VOICE}|${lang}|v2|${trimmed}`)}.mp3`);
    if (file.exists) return file.uri;

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        input: trimmed,
        instructions: instructionsFor(lang),
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      console.warn('tts: render failed', res.status);
      return null;
    }
    file.write(new Uint8Array(await res.arrayBuffer()));
    // Hard rule #3: every paid call through the meter.
    await recordSpend(spend('openai:tts_runtime', trimmed.length / 1000, new Date())).catch(() => {});
    return file.uri;
  } catch (e) {
    console.warn('tts: unavailable, staying text-only', e);
    return null;
  }
}
