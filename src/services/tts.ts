import { Directory, File, Paths } from 'expo-file-system';
import { spend } from '../lib/cost/meter';
import { recordSpend } from '../db';
import { getOpenAIKey } from './keys';

/**
 * Runtime TTS for dynamic teacher lines (owner pivot: NO device-TTS
 * fallback, ever). Each line renders once via OpenAI and is cached on disk
 * keyed by content hash — repeats are free and instant. No key or no
 * network → returns null and the UI stays text-only (degrade gracefully,
 * never block).
 *
 * Static pack clips are untouched: the bake-off ElevenLabs renders stay
 * cached in the bundle; OpenAI only voices what can't be pre-rendered.
 */

const VOICE = 'coral';
const MODEL = 'gpt-4o-mini-tts';
const INSTRUCTIONS =
  'You are the voice of a calm language teacher. Read the text naturally. ' +
  'Pronounce Indonesian, Spanish, or French words and phrases with authentic ' +
  'native pronunciation and rhythm; read English with a neutral accent. ' +
  'Leave a small beat before and after foreign words so the learner hears them clearly.';

function cacheDir(): Directory {
  return new Directory(Paths.cache, 'tts');
}

/** djb2 — stable, fast, fine for cache keys. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export async function ttsToFile(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const dir = cacheDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `${hash(`${MODEL}|${VOICE}|${trimmed}`)}.mp3`);
    if (file.exists) return file.uri;

    const key = await getOpenAIKey();
    if (!key) return null;

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        input: trimmed,
        instructions: INSTRUCTIONS,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      console.warn('tts: render failed', res.status);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    file.write(bytes);
    // Hard rule #3: every paid call through the meter.
    await recordSpend(spend('openai:tts_runtime', trimmed.length / 1000, new Date())).catch(() => {});
    return file.uri;
  } catch (e) {
    console.warn('tts: unavailable, staying text-only', e);
    return null;
  }
}
