/**
 * Content pack validator (plan §5.2 step 5). Run: npm run validate-content
 * [-- --require-audio]. Exits non-zero on errors; audio-file existence is a
 * warning until a pack has been rendered, an error with --require-audio.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from '../src/lib/matching/normalize';
import type { CoursePack, Lesson } from '../src/lib/content/types';

const CONTENT_DIR = join(__dirname, '..', 'content');
const VICTORY_LAP_SIZE = 3;

const errors: string[] = [];
const warnings: string[] = [];
const err = (msg: string) => errors.push(msg);
const warn = (msg: string) => warnings.push(msg);

function validatePack(path: string, requireAudio: boolean): void {
  const pack = JSON.parse(readFileSync(path, 'utf8')) as CoursePack;
  const lang = pack.language;
  const audioDir = join(CONTENT_DIR, lang, 'audio');
  const audioFiles = existsSync(audioDir)
    ? new Set(readdirSync(audioDir).map((f) => f.replace(/\.[^.]+$/, '')))
    : null;

  const itemIds = new Set<string>();
  const promptIds = new Set<string>();
  const seenItemIds = new Set<string>(); // cumulative, for forward-reference checks
  const usedAudioKeys = new Set<string>();

  const checkAudio = (key: string, owner: string) => {
    if (usedAudioKeys.has(key)) err(`${owner}: audio key "${key}" used twice`);
    usedAudioKeys.add(key);
    if (audioFiles && !audioFiles.has(key)) {
      (requireAudio ? err : warn)(`${owner}: no audio file for key "${key}"`);
    } else if (!audioFiles && requireAudio) {
      err(`${owner}: audio dir missing (${audioDir})`);
    }
  };

  const lessons: Lesson[] = pack.units.flatMap((u) => u.lessons);
  for (const lesson of lessons) {
    for (const item of lesson.items) {
      const where = `item ${item.id}`;
      if (itemIds.has(item.id)) err(`${where}: duplicate id`);
      itemIds.add(item.id);
      if (!['block', 'pattern', 'usage_note'].includes(item.type)) err(`${where}: bad type "${item.type}"`);
      if (!item.teach_script.trim()) err(`${where}: empty teach_script`);
      if (item.audio.teach !== `${item.id}-t`) err(`${where}: teach audio key must be "${item.id}-t"`);
      // Teach audio renders per language-segment (mixed-language clips
      // anglicize target words). Keys: <id>-t-<index>.
      if (!item.teach_segments || item.teach_segments.length === 0) {
        err(`${where}: missing teach_segments (run scripts/generate-teach-segments.py)`);
      } else {
        if (!item.teach_segments.some((s) => s.lang === 'target')) {
          err(`${where}: teach_segments contain no target-language segment`);
        }
        if (item.teach_segments.map((s) => s.text).join(' ') !== item.teach_script) {
          warn(`${where}: teach_segments do not reassemble into teach_script (stale — regenerate)`);
        }
        item.teach_segments.forEach((seg, i) => {
          if (!seg.text.trim()) err(`${where}: empty teach segment ${i}`);
          checkAudio(`${item.id}-t-${i}`, where);
        });
      }
      if (lang === 'zh' && item.type === 'block' && !item.romanization) {
        err(`${where}: zh blocks need pinyin romanization`);
      }
    }
    for (const item of lesson.items) seenItemIds.add(item.id);

    const maxDifficulty = Math.max(...lesson.prompts.map((p) => p.difficulty));
    lesson.prompts.forEach((prompt, idx) => {
      const where = `prompt ${prompt.id}`;
      if (promptIds.has(prompt.id)) err(`${where}: duplicate id`);
      promptIds.add(prompt.id);

      if (prompt.expected.length === 0) err(`${where}: empty expected[]`);
      for (const variant of prompt.expected) {
        if (normalize(variant, lang) !== variant) {
          err(`${where}: variant "${variant}" does not round-trip normalize() — store it normalized`);
        }
      }
      if (new Set(prompt.expected).size !== prompt.expected.length) err(`${where}: duplicate variants`);

      if (prompt.components.length === 0) err(`${where}: no components`);
      for (const c of prompt.components) {
        if (!seenItemIds.has(c)) {
          err(`${where}: component "${c}" ${itemIds.has(c) ? 'is taught in a later lesson (forward reference)' : 'does not exist'}`);
        }
      }

      if (prompt.difficulty < 1 || prompt.difficulty > 3) err(`${where}: difficulty out of range`);
      if (prompt.difficulty >= 2 && !prompt.decompose_script && idx < lesson.prompts.length - VICTORY_LAP_SIZE) {
        warn(`${where}: difficulty ${prompt.difficulty} without decompose_script`);
      }
      if (idx >= lesson.prompts.length - VICTORY_LAP_SIZE && prompt.difficulty < maxDifficulty) {
        warn(`${where}: victory-lap prompt below lesson max difficulty (${prompt.difficulty} < ${maxDifficulty})`);
      }

      const a = prompt.audio;
      if (a.cue !== `${prompt.id}-c`) err(`${where}: cue audio key must be "${prompt.id}-c"`);
      if (a.answer !== `${prompt.id}-a`) err(`${where}: answer audio key must be "${prompt.id}-a"`);
      if (a.answer_slow !== `${prompt.id}-s`) err(`${where}: slow audio key must be "${prompt.id}-s"`);
      checkAudio(a.cue, where);
      checkAudio(a.answer, where);
      checkAudio(a.answer_slow, where);
      if (a.decompose) checkAudio(a.decompose, where);
    });
  }

  // Orthography drift: every block's target_text must appear as a token (or
  // hanzi substring) of some canonical answer, or the pack teaches words no
  // prompt ever exercises.
  for (const lesson of lessons) {
    for (const item of lesson.items) {
      if (item.type !== 'block') continue;
      const target = normalize(item.target_text, lang);
      // Word-boundary phrase match so multi-word blocks ("tengo que",
      // "je veux") count; zh matches on hanzi substring.
      const appears = lessons.some((l) =>
        l.prompts.some((p) =>
          lang === 'zh' ? p.expected[0].includes(target) : ` ${p.expected[0]} `.includes(` ${target} `),
        ),
      );
      if (!appears) err(`item ${item.id}: target_text "${item.target_text}" never appears in any canonical answer`);
    }
  }

  for (const template of pack.templates) {
    for (const slot of template.slots) {
      if (slot.fillers.length === 0) err(`template ${template.id}: slot ${slot.name} has no fillers`);
      for (const f of slot.fillers) {
        if (!itemIds.has(f)) err(`template ${template.id}: filler "${f}" does not exist`);
      }
    }
  }

  for (const [key, line] of Object.entries(pack.system_lines)) {
    if (!line.text.trim()) err(`system_lines.${key}: empty text`);
    checkAudio(line.audio, `system_lines.${key}`);
  }

  const promptCount = lessons.reduce((n, l) => n + l.prompts.length, 0);
  console.log(`${path}: ${lessons.length} lessons, ${itemIds.size} items, ${promptCount} prompts`);
}

const requireAudio = process.argv.includes('--require-audio');
const packs: string[] = [];
for (const lang of readdirSync(CONTENT_DIR)) {
  const packPath = join(CONTENT_DIR, lang, 'foundation.json');
  if (existsSync(packPath)) packs.push(packPath);
}
if (packs.length === 0) {
  console.error('No packs found under content/<lang>/foundation.json');
  process.exit(1);
}
for (const p of packs) validatePack(p, requireAudio);

for (const w of warnings) console.warn(`  warn: ${w}`);
for (const e of errors) console.error(`  ERROR: ${e}`);
console.log(`\n${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length > 0 ? 1 : 0);
