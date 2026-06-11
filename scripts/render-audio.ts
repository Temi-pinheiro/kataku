/**
 * Audio pack renderer (plan §4.1, §5.2 step 4).
 *
 *   npm run render-audio -- --lang id [--dry-run]
 *   npm run render-audio -- --bakeoff
 *
 * Spend split: target-language lines (teach, answers) render with the
 * premium voice; English cues and system lines with the cheap voice. Files
 * land in content/<lang>/audio/<key>.mp3, hash-keyed via
 * render-manifest.json so re-renders only touch changed lines. Slow answers
 * use provider speed/instruction controls — never time-stretching (tone
 * contours must survive).
 *
 * Keys come from .env (gitignored): OPENAI_API_KEY, AZURE_SPEECH_KEY +
 * AZURE_SPEECH_REGION, ELEVENLABS_API_KEY.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CoursePack } from '../src/lib/content/types';

// ---- config ------------------------------------------------------------

type ProviderName = 'openai' | 'azure' | 'elevenlabs' | 'google';

interface VoiceChoice {
  provider: ProviderName;
  voice: string;
}

/**
 * Per-language voice config. The premium slot is decided by the owner's
 * blind bake-off (M2) — placeholders below until then. Cheap = English
 * cues/system lines.
 */
const VOICES: Record<string, { premium: VoiceChoice; cheap: VoiceChoice }> = {
  id: {
    premium: { provider: 'openai', voice: 'marin' }, // TODO: bake-off winner
    cheap: { provider: 'openai', voice: 'alloy' },
  },
  zh: {
    premium: { provider: 'openai', voice: 'marin' }, // TODO: bake-off winner
    cheap: { provider: 'openai', voice: 'alloy' },
  },
};

/** Bake-off sample (plan §4.1): identical lines through every provider. */
const BAKEOFF_SAMPLES: { name: string; lang: string; text: string; slow?: boolean }[] = [
  { name: 'id-teach', lang: 'id', text: 'Sekarang. Sekarang.' },
  { name: 'id-answer-1', lang: 'id', text: 'Saya mau makan sekarang.' },
  { name: 'id-answer-1-slow', lang: 'id', text: 'Saya mau makan sekarang.', slow: true },
  { name: 'id-answer-2', lang: 'id', text: 'Saya tidak bisa pergi ke pasar sekarang karena saya harus makan.' },
  { name: 'id-question', lang: 'id', text: 'Kamu sudah makan?' },
  { name: 'zh-teach', lang: 'zh', text: '要。要。' },
  { name: 'zh-answer-1', lang: 'zh', text: '我要吃饭。' },
  { name: 'zh-answer-1-slow', lang: 'zh', text: '我要吃饭。', slow: true },
  { name: 'zh-tone-pair', lang: 'zh', text: '买。卖。买卖。' },
  { name: 'zh-answer-2', lang: 'zh', text: '我现在不能去，因为我要吃饭。' },
];

const BCP47: Record<string, string> = { id: 'id-ID', zh: 'zh-CN', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', en: 'en-US' };

// ---- env ----------------------------------------------------------------

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const envPath = join(__dirname, '..', '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}
const ENV = loadEnv();

// ---- provider adapters ---------------------------------------------------

interface RenderOpts {
  voice: string;
  lang: string; // pack language code
  slow: boolean;
}

type Renderer = (text: string, opts: RenderOpts) => Promise<Buffer>;

const renderOpenAI: Renderer = async (text, opts) => {
  const key = ENV.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing (.env)');
  const instructions = opts.slow
    ? 'Speak very slowly and clearly, like a patient language teacher demonstrating a sentence word by word. Keep natural pronunciation and intonation.'
    : 'Speak naturally at native speed, like a friendly language teacher.';
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: opts.voice,
      input: text,
      instructions,
      response_format: 'mp3',
    }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
};

const renderAzure: Renderer = async (text, opts) => {
  const key = ENV.AZURE_SPEECH_KEY;
  const region = ENV.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION missing (.env)');
  const locale = BCP47[opts.lang] ?? 'en-US';
  const rate = opts.slow ? '-35%' : '0%';
  const ssml =
    `<speak version="1.0" xml:lang="${locale}">` +
    `<voice name="${opts.voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
};

const renderElevenLabs: Renderer = async (text, opts) => {
  const key = ENV.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY missing (.env)');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${opts.voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: opts.slow ? 0.7 : 1.0 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
};

const renderGoogle: Renderer = async () => {
  // Chirp 3 HD / Gemini TTS needs GCP auth (service account or gcloud ADC);
  // wire this up when the owner has a GCP project — see docs/OWNER-TODO.md.
  throw new Error('Google TTS adapter not implemented yet');
};

const RENDERERS: Record<ProviderName, Renderer> = {
  openai: renderOpenAI,
  azure: renderAzure,
  elevenlabs: renderElevenLabs,
  google: renderGoogle,
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

// ---- job collection ------------------------------------------------------

interface Job {
  key: string;
  text: string;
  tier: 'premium' | 'cheap';
  lang: string; // language the TTS should speak
  slow: boolean;
}

/** Answers are stored normalized; give the TTS sentence orthography. */
function sentenceCase(normalized: string): string {
  return normalized.charAt(0).toUpperCase() + normalized.slice(1) + '.';
}

function collectJobs(pack: CoursePack): Job[] {
  const jobs: Job[] = [];
  for (const unit of pack.units) {
    for (const lesson of unit.lessons) {
      for (const item of lesson.items) {
        jobs.push({ key: item.audio.teach, text: item.teach_script, tier: 'premium', lang: pack.language, slow: false });
      }
      for (const p of lesson.prompts) {
        const answer = sentenceCase(p.expected[0]);
        jobs.push({ key: p.audio.cue, text: p.cue_en, tier: 'cheap', lang: 'en', slow: false });
        jobs.push({ key: p.audio.answer, text: answer, tier: 'premium', lang: pack.language, slow: false });
        jobs.push({ key: p.audio.answer_slow, text: answer, tier: 'premium', lang: pack.language, slow: true });
        if (p.audio.decompose && p.decompose_script) {
          jobs.push({ key: p.audio.decompose, text: p.decompose_script, tier: 'premium', lang: pack.language, slow: false });
        }
      }
    }
  }
  for (const line of Object.values(pack.system_lines)) {
    jobs.push({ key: line.audio, text: line.text, tier: 'cheap', lang: 'en', slow: false });
  }
  return jobs;
}

// ---- main ----------------------------------------------------------------

type Manifest = Record<string, { hash: string; provider: string; voice: string }>;

async function renderPack(lang: string, dryRun: boolean): Promise<void> {
  const packPath = join(__dirname, '..', 'content', lang, 'foundation.json');
  const pack = JSON.parse(readFileSync(packPath, 'utf8')) as CoursePack;
  const voices = VOICES[lang];
  if (!voices) throw new Error(`No voice config for "${lang}" — add it to VOICES in scripts/render-audio.ts`);

  const audioDir = join(__dirname, '..', 'content', lang, 'audio');
  const manifestPath = join(audioDir, 'render-manifest.json');
  const manifest: Manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

  const jobs = collectJobs(pack);
  const premiumChars = jobs.filter((j) => j.tier === 'premium').reduce((n, j) => n + j.text.length, 0);
  const cheapChars = jobs.filter((j) => j.tier === 'cheap').reduce((n, j) => n + j.text.length, 0);
  console.log(`${jobs.length} clips | premium ${premiumChars} chars (${voices.premium.provider}:${voices.premium.voice}) | cheap ${cheapChars} chars (${voices.cheap.provider}:${voices.cheap.voice})`);

  let rendered = 0;
  let skipped = 0;
  for (const job of jobs) {
    const choice = job.tier === 'premium' ? voices.premium : voices.cheap;
    const hash = createHash('sha256')
      .update(JSON.stringify({ text: job.text, provider: choice.provider, voice: choice.voice, slow: job.slow }))
      .digest('hex');
    const outPath = join(audioDir, `${job.key}.mp3`);
    if (manifest[job.key]?.hash === hash && existsSync(outPath)) {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`  would render ${job.key} [${choice.provider}/${choice.voice}${job.slow ? ' slow' : ''}]: ${job.text.slice(0, 60)}`);
      rendered++;
      continue;
    }
    mkdirSync(audioDir, { recursive: true });
    const audio = await RENDERERS[choice.provider](job.text, { voice: choice.voice, lang: job.lang, slow: job.slow });
    writeFileSync(outPath, audio);
    manifest[job.key] = { hash, provider: choice.provider, voice: choice.voice };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    rendered++;
    console.log(`  rendered ${job.key} (${audio.length} bytes)`);
  }
  console.log(`${dryRun ? 'would render' : 'rendered'} ${rendered}, unchanged ${skipped}`);
}

async function bakeoff(): Promise<void> {
  const outDir = join(__dirname, '..', 'content', 'bakeoff');
  mkdirSync(outDir, { recursive: true });
  // Default audition voices per provider; swap freely before running.
  const candidates: { provider: ProviderName; voice: Record<string, string> }[] = [
    { provider: 'openai', voice: { id: 'marin', zh: 'marin' } },
    { provider: 'azure', voice: { id: 'id-ID-GadisNeural', zh: 'zh-CN-XiaoxiaoNeural' } },
    { provider: 'elevenlabs', voice: { id: ENV.ELEVENLABS_VOICE_ID ?? '', zh: ENV.ELEVENLABS_VOICE_ZH ?? ENV.ELEVENLABS_VOICE_ID ?? '' } },
    { provider: 'google', voice: { id: '', zh: '' } },
  ];
  for (const c of candidates) {
    for (const sample of BAKEOFF_SAMPLES) {
      const file = join(outDir, `${sample.name}--${c.provider}.mp3`);
      if (existsSync(file)) continue;
      try {
        const audio = await RENDERERS[c.provider](sample.text, {
          voice: c.voice[sample.lang] ?? '',
          lang: sample.lang,
          slow: sample.slow ?? false,
        });
        writeFileSync(file, audio);
        console.log(`  ${c.provider}: ${sample.name} ok`);
      } catch (e) {
        console.log(`  ${c.provider}: ${sample.name} skipped — ${(e as Error).message.split('\n')[0]}`);
      }
    }
  }
  console.log(`\nListen blind in ${outDir}, pick a winner per language, then set VOICES in scripts/render-audio.ts.`);
}

const args = process.argv.slice(2);
if (args.includes('--bakeoff')) {
  bakeoff().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  const lang = args[args.indexOf('--lang') + 1];
  if (!args.includes('--lang') || !lang) {
    console.error('Usage: npm run render-audio -- --lang id [--dry-run] | npm run render-audio -- --bakeoff');
    process.exit(1);
  }
  renderPack(lang, args.includes('--dry-run')).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
