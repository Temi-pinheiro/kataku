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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
/**
 * Bake-off decided by the owner 2026-06-11 (blind, two rounds):
 * ElevenLabs won overall — Azure's slow renders (SSML rate) sounded like
 * time-stretched playback; ElevenLabs regenerates slow speech naturally.
 * The premium voice id lives in .env (ELEVENLABS_VOICE_ID). English cues
 * stay on cheap OpenAI per the §4.1 spend split.
 */
const ELEVEN_VOICE = (): string => {
  const v = ENV.ELEVENLABS_VOICE_ID;
  if (!v) throw new Error('ELEVENLABS_VOICE_ID missing (.env) — the bake-off winner needs it');
  return v;
};

const VOICES: Record<string, { premium: () => VoiceChoice; cheap: () => VoiceChoice }> = {
  id: {
    premium: () => ({ provider: 'elevenlabs', voice: ELEVEN_VOICE() }),
    cheap: () => ({ provider: 'openai', voice: 'alloy' }),
  },
  es: {
    premium: () => ({ provider: 'elevenlabs', voice: ELEVEN_VOICE() }),
    cheap: () => ({ provider: 'openai', voice: 'alloy' }),
  },
  fr: {
    premium: () => ({ provider: 'elevenlabs', voice: ELEVEN_VOICE() }),
    cheap: () => ({ provider: 'openai', voice: 'alloy' }),
  },
};

/** Bake-off sample (plan §4.1): identical lines through every provider. */
const BAKEOFF_SAMPLES: { name: string; lang: string; text: string; slow?: boolean; relaxed?: boolean }[] = [
  { name: 'id-teach', lang: 'id', text: 'Sekarang. Sekarang.' },
  { name: 'id-answer-1', lang: 'id', text: 'Saya mau makan sekarang.' },
  { name: 'id-answer-1-slow', lang: 'id', text: 'Saya mau makan sekarang.', slow: true },
  { name: 'id-answer-2', lang: 'id', text: 'Saya tidak bisa pergi ke pasar sekarang karena saya harus makan.' },
  { name: 'id-question', lang: 'id', text: 'Kamu sudah makan?' },
  // Long multi-clause lines so pacing and rhythm are judgeable; the
  // "relaxed" variant shows the pace knob we control after the choice.
  {
    name: 'id-long',
    lang: 'id',
    text: 'Saya sudah pergi ke pasar tapi saya belum beli itu, karena saya harus pulang sekarang dan saya akan pergi lagi besok.',
  },
  {
    name: 'id-long-relaxed',
    lang: 'id',
    text: 'Saya sudah pergi ke pasar tapi saya belum beli itu, karena saya harus pulang sekarang dan saya akan pergi lagi besok.',
    relaxed: true,
  },
  {
    name: 'id-long-slow',
    lang: 'id',
    text: 'Saya sudah pergi ke pasar tapi saya belum beli itu, karena saya harus pulang sekarang.',
    slow: true,
  },
  // Teach lines mix English and the target language — the premium voice
  // must handle the switch; judge that here.
  {
    name: 'id-teach-long',
    lang: 'id',
    text: "'Tomorrow' is 'besok'. Besok. Saya akan pergi besok — I will go tomorrow.",
  },
  // Spanish / French (quality-baseline packs) — answer + slow + teach mix.
  { name: 'es-answer', lang: 'es', text: 'No puedo ir al mercado ahora porque tengo que comer.' },
  { name: 'es-answer-slow', lang: 'es', text: 'No puedo ir al mercado ahora porque tengo que comer.', slow: true },
  { name: 'es-teach-long', lang: 'es', text: "'Tomorrow' is 'mañana'. Mañana. Voy a ir mañana — I'm going to go tomorrow." },
  { name: 'fr-answer', lang: 'fr', text: 'Je ne peux pas aller au marché maintenant parce que je dois manger.' },
  { name: 'fr-answer-slow', lang: 'fr', text: 'Je ne peux pas aller au marché maintenant parce que je dois manger.', slow: true },
  { name: 'fr-teach-long', lang: 'fr', text: "'Tomorrow' is 'demain'. Demain. Je vais aller demain — I'm going to go tomorrow." },
  // Conversational register — what the S1 conversation-mode partner will
  // sound like: natural everyday speech, a question, real rhythm.
  { name: 'id-conv', lang: 'id', text: 'Kamu sudah makan belum? Tadi aku ke pasar, tapi nggak beli apa-apa karena buru-buru.' },
  { name: 'es-conv', lang: 'es', text: '¿Ya comiste? Fui al mercado esta mañana, pero no compré nada porque no tenía tiempo.' },
  { name: 'fr-conv', lang: 'fr', text: "Tu as déjà mangé ? Je suis allé au marché ce matin, mais j'ai rien acheté parce que j'avais pas le temps." },
];

const BCP47: Record<string, string> = { id: 'id-ID', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', en: 'en-US' };

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
  /** Gentler-than-default pace (the post-bake-off tuning knob). */
  relaxed?: boolean;
}

type Renderer = (text: string, opts: RenderOpts) => Promise<Buffer>;

const renderOpenAI: Renderer = async (text, opts) => {
  const key = ENV.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing (.env)');
  const instructions = opts.slow
    ? 'Speak very slowly and clearly, like a patient language teacher demonstrating a sentence word by word. Keep natural pronunciation and intonation.'
    : opts.relaxed
      ? 'Speak naturally with native pronunciation, but at a calm, unhurried teaching pace — clearly separated words, no rushing.'
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
  const rate = opts.slow ? '-35%' : opts.relaxed ? '-12%' : '0%';
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
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: opts.slow ? 0.7 : opts.relaxed ? 0.9 : 1.0 },
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
        // One clip per language segment: English narration on the cheap
        // voice, target-language words on the premium voice — a single
        // mixed render anglicizes the target words ("komair").
        item.teach_segments.forEach((seg, i) => {
          jobs.push({
            key: `${item.id}-t-${i}`,
            text: seg.text,
            tier: seg.lang === 'target' ? 'premium' : 'cheap',
            lang: seg.lang === 'target' ? pack.language : 'en',
            slow: false,
          });
        });
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
  const premium = voices.premium();
  const cheap = voices.cheap();

  const audioDir = join(__dirname, '..', 'content', lang, 'audio');
  const manifestPath = join(audioDir, 'render-manifest.json');
  const manifest: Manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};

  const jobs = collectJobs(pack);
  const premiumChars = jobs.filter((j) => j.tier === 'premium').reduce((n, j) => n + j.text.length, 0);
  const cheapChars = jobs.filter((j) => j.tier === 'cheap').reduce((n, j) => n + j.text.length, 0);
  console.log(`${jobs.length} clips | premium ${premiumChars} chars (${premium.provider}) | cheap ${cheapChars} chars (${cheap.provider}:${cheap.voice})`);

  let rendered = 0;
  let skipped = 0;
  const pending: { job: Job; choice: VoiceChoice; hash: string; outPath: string }[] = [];
  for (const job of jobs) {
    const choice = job.tier === 'premium' ? premium : cheap;
    const hash = createHash('sha256')
      .update(JSON.stringify({ text: job.text, provider: choice.provider, voice: choice.voice, slow: job.slow }))
      .digest('hex');
    const outPath = join(audioDir, `${job.key}.mp3`);
    if (manifest[job.key]?.hash === hash && existsSync(outPath)) {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`  would render ${job.key} [${choice.provider}${job.slow ? ' slow' : ''}]: ${job.text.slice(0, 60)}`);
      rendered++;
      continue;
    }
    pending.push({ job, choice, hash, outPath });
  }

  // Small batches: faster than serial, within free-tier concurrency limits.
  // Interrupted/failed runs resume via the manifest — just re-run.
  const BATCH = 2;
  mkdirSync(audioDir, { recursive: true });
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ({ job, choice, hash, outPath }) => {
        const audio = await RENDERERS[choice.provider](job.text, { voice: choice.voice, lang: job.lang, slow: job.slow });
        writeFileSync(outPath, audio);
        manifest[job.key] = { hash, provider: choice.provider, voice: choice.voice };
        rendered++;
      }),
    );
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    if ((i / BATCH) % 20 === 0) console.log(`  …${Math.min(i + BATCH, pending.length)}/${pending.length}`);
  }
  console.log(`${dryRun ? 'would render' : 'rendered'} ${rendered}, unchanged ${skipped}`);
  if (!dryRun) generateAudioMap(lang);
}

/**
 * Regenerate src/generated/audio-map.<lang>.ts so metro bundles the rendered
 * clips into the app binary (plan §6: bundled packs, no backend). The file
 * is committed as an empty placeholder; after a render it references the
 * gitignored mp3s, which is fine for a single-machine project.
 */
function generateAudioMap(lang: string): void {
  const audioDir = join(__dirname, '..', 'content', lang, 'audio');
  const outPath = join(__dirname, '..', 'src', 'generated', `audio-map.${lang}.ts`);
  const keys = existsSync(audioDir)
    ? readdirSync(audioDir)
        .filter((f) => f.endsWith('.mp3'))
        .map((f) => f.replace(/\.mp3$/, ''))
        .sort()
    : [];
  const entries = keys.map((k) => `  '${k}': require('../../content/${lang}/audio/${k}.mp3'),`).join('\n');
  writeFileSync(
    outPath,
    `// AUTO-GENERATED by scripts/render-audio.ts — do not edit by hand.\n` +
      `// Regenerated on every render of the ${lang} pack.\n` +
      `export const AUDIO_MAP: Record<string, number> = {\n${entries}\n};\n`,
  );
  console.log(`audio map: ${keys.length} clips → src/generated/audio-map.${lang}.ts`);
}

async function bakeoff(): Promise<void> {
  const outDir = join(__dirname, '..', 'content', 'bakeoff');
  mkdirSync(outDir, { recursive: true });
  // Default audition voices per provider; swap freely before running.
  const eleven = ENV.ELEVENLABS_VOICE_ID ?? '';
  const candidates: { provider: ProviderName; voice: Record<string, string> }[] = [
    { provider: 'openai', voice: { id: 'coral', es: 'coral', fr: 'coral' } },
    {
      provider: 'azure',
      voice: { id: 'id-ID-GadisNeural', es: 'es-ES-ElviraNeural', fr: 'fr-FR-DeniseNeural' },
    },
    { provider: 'elevenlabs', voice: { id: eleven, es: eleven, fr: eleven } },
    { provider: 'google', voice: { id: '', es: '', fr: '' } },
  ];
  // Blind listening: providers get shuffled letters; the mapping goes to
  // key.json, to be read only after picking winners. An existing key.json
  // is REUSED so re-runs (new samples, new keys in .env) never reshuffle —
  // letters stay comparable across runs. Delete key.json + the mp3s to
  // start a fresh blind test.
  const keyPath = join(outDir, 'key.json');
  const key: Record<string, string> = existsSync(keyPath) ? JSON.parse(readFileSync(keyPath, 'utf8')) : {};
  const providerToLetter = new Map(Object.entries(key).map(([letter, provider]) => [provider, letter]));
  const freeLetters = ['A', 'B', 'C', 'D'].filter((l) => !(l in key)).sort(() => Math.random() - 0.5);
  for (const c of candidates) {
    if (!providerToLetter.has(c.provider)) {
      const letter = freeLetters.shift()!;
      providerToLetter.set(c.provider, letter);
      key[letter] = c.provider;
    }
  }

  // `--only A,B` renders just those letters (finalist rounds).
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(process.argv[onlyIdx + 1]?.toUpperCase().split(',')) : null;

  for (const c of candidates) {
    const letter = providerToLetter.get(c.provider)!;
    if (only && !only.has(letter)) {
      console.log(`  voice ${letter}: skipped (--only)`);
      continue;
    }
    let rendered = 0;
    for (const sample of BAKEOFF_SAMPLES) {
      const file = join(outDir, `${sample.name}--${letter}.mp3`);
      if (existsSync(file)) continue;
      try {
        const audio = await RENDERERS[c.provider](sample.text, {
          voice: c.voice[sample.lang] ?? '',
          lang: sample.lang,
          slow: sample.slow ?? false,
          relaxed: sample.relaxed ?? false,
        });
        writeFileSync(file, audio);
        rendered++;
      } catch (e) {
        console.log(`  voice ${letter}: ${sample.name} skipped — ${(e as Error).message.split('\n')[0]}`);
      }
    }
    console.log(`  voice ${letter}: ${rendered}/${BAKEOFF_SAMPLES.length} samples rendered`);
  }
  writeFileSync(keyPath, JSON.stringify(key, null, 2));
  console.log(`\nListen in ${outDir} (don't open key.json yet!), pick the best letter per language,`);
  console.log('then check key.json and set VOICES in scripts/render-audio.ts.');
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
