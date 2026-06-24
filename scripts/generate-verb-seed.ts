/**
 * Pre-generate the bundled verb pages (src/generated/verb-seed.ts) for the most
 * common verbs, so they cost ZERO tokens even on first view in the app.
 *
 *   npm run generate-verb-seed                 # all languages in CURATED
 *   npm run generate-verb-seed -- --lang es    # one language
 *
 * Owner-run, cost-metered (logged here; the device api_spend table is on-device
 * only). Prefers Claude Sonnet for accuracy, OpenAI gpt-4.1-mini fallback.
 * Keys come from .env (gitignored): ANTHROPIC_API_KEY and/or OPENAI_API_KEY.
 *
 * AFTER running: spot-check a few conjugations before shipping (hard rule #6 —
 * the owner reviews generated reference content). Merges into the existing seed,
 * so entries not in CURATED (and any you've hand-verified) are preserved.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spend, formatUsd } from '../src/lib/cost/meter';
import { extractJson } from '../src/lib/extract-json';
import { detailSystem, detailUser } from '../src/lib/verbs/prompt';
import { parseVerbEntry, type VerbEntry } from '../src/lib/verbs/types';
import { VERB_SEED as EXISTING } from '../src/generated/verb-seed';

const LANGUAGE_NAMES_EN: Record<string, string> = { id: 'Indonesian', es: 'Spanish', fr: 'French', it: 'Italian' };

/** Curated high-frequency verbs (lemma + English gloss). Edit freely. */
const CURATED: Record<string, [string, string][]> = {
  es: [
    ['ser', 'to be (essence)'], ['estar', 'to be (state)'], ['tener', 'to have'], ['hacer', 'to do, to make'],
    ['ir', 'to go'], ['poder', 'to be able to'], ['querer', 'to want'], ['hablar', 'to speak'],
    ['decir', 'to say'], ['ver', 'to see'], ['dar', 'to give'], ['saber', 'to know'],
    ['comer', 'to eat'], ['beber', 'to drink'], ['vivir', 'to live'], ['venir', 'to come'],
    ['poner', 'to put'], ['salir', 'to leave, to go out'], ['volver', 'to return'], ['llegar', 'to arrive'],
    ['pensar', 'to think'], ['encontrar', 'to find'], ['trabajar', 'to work'], ['necesitar', 'to need'],
    ['gustar', 'to be pleasing (to like)'], ['entender', 'to understand'], ['empezar', 'to begin'], ['dormir', 'to sleep'],
  ],
  fr: [
    ['être', 'to be'], ['avoir', 'to have'], ['faire', 'to do, to make'], ['aller', 'to go'],
    ['dire', 'to say'], ['pouvoir', 'to be able to'], ['vouloir', 'to want'], ['parler', 'to speak'],
    ['voir', 'to see'], ['savoir', 'to know'], ['venir', 'to come'], ['prendre', 'to take'],
    ['manger', 'to eat'], ['boire', 'to drink'], ['vivre', 'to live'], ['mettre', 'to put'],
    ['partir', 'to leave'], ['sortir', 'to go out'], ['donner', 'to give'], ['aimer', 'to like, to love'],
    ['comprendre', 'to understand'], ['trouver', 'to find'], ['travailler', 'to work'], ['attendre', 'to wait'],
    ['finir', 'to finish'], ['dormir', 'to sleep'], ['acheter', 'to buy'], ['devoir', 'to have to'],
  ],
  it: [
    ['essere', 'to be'], ['avere', 'to have'], ['fare', 'to do, to make'], ['andare', 'to go'],
    ['potere', 'to be able to'], ['volere', 'to want'], ['dire', 'to say'], ['parlare', 'to speak'],
    ['mangiare', 'to eat'], ['bere', 'to drink'], ['venire', 'to come'], ['vedere', 'to see'],
  ],
  id: [
    ['makan', 'to eat'], ['minum', 'to drink'], ['pergi', 'to go'], ['mau', 'to want'],
    ['bisa', 'can, to be able to'], ['pulang', 'to go home'], ['beli', 'to buy'], ['lihat', 'to see'],
  ],
};

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  const envPath = join(__dirname, '..', '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

const ENV = loadEnv();

let totalCost = 0;

async function generate(langName: string, lemma: string, gloss: string): Promise<VerbEntry | null> {
  const anthropic = ENV.ANTHROPIC_API_KEY;
  const openai = ENV.OPENAI_API_KEY;
  const now = new Date();

  if (anthropic) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3500,
        system: detailSystem(langName),
        messages: [{ role: 'user', content: detailUser(langName, lemma, gloss) }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    if (data.usage) {
      totalCost += spend('anthropic:verb_detail_input', data.usage.input_tokens / 1000, now).costUsd;
      totalCost += spend('anthropic:verb_detail_output', data.usage.output_tokens / 1000, now).costUsd;
    }
    const text = (data.content ?? []).filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n');
    return parseVerbEntry(extractJson(text), lemma, gloss);
  }

  if (openai) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.2,
        max_tokens: 3500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: detailSystem(langName) },
          { role: 'user', content: detailUser(langName, lemma, gloss) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    if (data.usage) {
      totalCost += spend('openai:verb_detail_input', data.usage.prompt_tokens / 1000, now).costUsd;
      totalCost += spend('openai:verb_detail_output', data.usage.completion_tokens / 1000, now).costUsd;
    }
    return parseVerbEntry(extractJson(data.choices?.[0]?.message?.content ?? ''), lemma, gloss);
  }

  throw new Error('No ANTHROPIC_API_KEY or OPENAI_API_KEY in .env');
}

async function main(): Promise<void> {
  const langArg = process.argv.indexOf('--lang');
  const langs = langArg >= 0 ? [process.argv[langArg + 1]] : Object.keys(CURATED);

  const seed: Record<string, VerbEntry> = { ...EXISTING };
  for (const lang of langs) {
    const list = CURATED[lang];
    const langName = LANGUAGE_NAMES_EN[lang];
    if (!list || !langName) {
      console.warn(`skip ${lang}: no curated list`);
      continue;
    }
    console.log(`\n${langName} (${lang}) — ${list.length} verbs`);
    for (const [lemma, gloss] of list) {
      try {
        const entry = await generate(langName, lemma, gloss);
        if (entry) {
          seed[`${lang}:${lemma}`] = entry;
          console.log(`  ✓ ${lemma} (${entry.tables.length} tables, ${entry.examples.length} examples)`);
        } else {
          console.warn(`  ✗ ${lemma}: unusable page, kept existing`);
        }
      } catch (e) {
        console.warn(`  ✗ ${lemma}: ${(e as Error).message.split('\n')[0]} — kept existing`);
      }
    }
  }

  const body = Object.keys(seed)
    .sort()
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(seed[k])},`)
    .join('\n');
  const out =
    `import type { VerbEntry } from '../lib/verbs/types';\n\n` +
    `// AUTO-GENERATED by scripts/generate-verb-seed.ts — spot-check before shipping.\n` +
    `// Bundled verb pages, keyed \`\${lang}:\${lemma}\`; ZERO tokens on first view.\n` +
    `export const VERB_SEED: Record<string, VerbEntry> = {\n${body}\n};\n`;
  writeFileSync(join(__dirname, '..', 'src', 'generated', 'verb-seed.ts'), out);
  console.log(`\n→ src/generated/verb-seed.ts (${Object.keys(seed).length} verbs) | est. cost ${formatUsd(totalCost)}`);
  console.log('Spot-check a few conjugations before shipping.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
