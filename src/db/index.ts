import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { PROGRESS_TABLES, SCHEMA_SQL } from './schema';
import type { CoursePack } from '../lib/content/types';
import { allLessons } from '../lib/content/types';
import type { MasteryState } from '../lib/scheduler/scheduler';
import type { SpendEvent } from '../lib/cost/meter';
import type { MatchResult } from '../lib/matching';
import type { Lexeme, VerbEntry } from '../lib/verbs/types';
import { VERB_SCHEMA_VERSION } from '../lib/verbs/types';

let db: SQLiteDatabase | null = null;

export async function openDb(): Promise<SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('kataku.db');
    await db.execAsync(SCHEMA_SQL);
  }
  return db;
}

/** Replace a language's content tables from a JSON pack (read-mostly, plan §7). */
export async function loadPack(pack: CoursePack): Promise<void> {
  const d = await openDb();
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM item WHERE language = ?', pack.language);
    await d.runAsync('DELETE FROM prompt WHERE language = ?', pack.language);
    for (const { unit, lesson } of allLessons(pack)) {
      const lessonRef = `${unit.index}.${lesson.index}`;
      for (const item of lesson.items) {
        await d.runAsync(
          'INSERT INTO item (id, language, lesson_ref, type, concept_en, target_text, romanization) VALUES (?,?,?,?,?,?,?)',
          item.id, pack.language, lessonRef, item.type, item.concept_en, item.target_text, item.romanization,
        );
      }
      for (const prompt of lesson.prompts) {
        await d.runAsync(
          'INSERT INTO prompt (id, language, lesson_ref, cue_en, expected_json, components_json, difficulty) VALUES (?,?,?,?,?,?,?)',
          prompt.id, pack.language, lessonRef, prompt.cue_en,
          JSON.stringify(prompt.expected), JSON.stringify(prompt.components), prompt.difficulty,
        );
      }
    }
    await d.runAsync(
      'INSERT INTO language (code, name, stt_locale, pack_version) VALUES (?,?,?,?) ' +
        'ON CONFLICT(code) DO UPDATE SET pack_version = excluded.pack_version',
      pack.language, pack.language, sttLocaleFor(pack.language), pack.version,
    );
  });
}

export function sttLocaleFor(language: string): string {
  const locales: Record<string, string> = { id: 'id-ID', fr: 'fr-FR', it: 'it-IT', es: 'es-ES' };
  return locales[language] ?? 'en-US';
}

// ---- mastery ----

export async function getAllMastery(): Promise<MasteryState[]> {
  const d = await openDb();
  const rows = await d.getAllAsync<{ item_id: string; strength: number; last_seen_at: string | null; due_at: string | null }>(
    'SELECT item_id, strength, last_seen_at, due_at FROM mastery',
  );
  return rows.map((r) => ({ itemId: r.item_id, strength: r.strength, lastSeenAt: r.last_seen_at, dueAt: r.due_at }));
}

export async function upsertMastery(state: MasteryState): Promise<void> {
  const d = await openDb();
  await d.runAsync(
    'INSERT INTO mastery (item_id, strength, last_seen_at, due_at) VALUES (?,?,?,?) ' +
      'ON CONFLICT(item_id) DO UPDATE SET strength = excluded.strength, last_seen_at = excluded.last_seen_at, due_at = excluded.due_at',
    state.itemId, state.strength, state.lastSeenAt, state.dueAt,
  );
}

// ---- attempts & sessions ----

export interface AttemptRow {
  promptId: string;
  at: string;
  transcript: string;
  result: MatchResult;
  thinkMs: number | null;
  retries: number;
  audioUri: string | null;
}

export async function recordAttempt(a: AttemptRow): Promise<void> {
  const d = await openDb();
  await d.runAsync(
    'INSERT INTO attempt (prompt_id, at, transcript, result, think_ms, retries, audio_uri) VALUES (?,?,?,?,?,?,?)',
    a.promptId, a.at, a.transcript, a.result, a.thinkMs, a.retries, a.audioUri,
  );
}

export async function startSession(language: string, now: Date): Promise<number> {
  const d = await openDb();
  const res = await d.runAsync('INSERT INTO session (language, started_at) VALUES (?,?)', language, now.toISOString());
  return res.lastInsertRowId;
}

export async function finishSession(
  id: number,
  stats: { newItems: number; promptsDone: number; coreCompleted: boolean },
  now: Date,
): Promise<void> {
  const d = await openDb();
  await d.runAsync(
    'UPDATE session SET ended_at = ?, new_items = ?, prompts_done = ?, core_completed = ? WHERE id = ?',
    now.toISOString(), stats.newItems, stats.promptsDone, stats.coreCompleted ? 1 : 0, id,
  );
}

/** Lesson chunks completed for a language — drives buildSession's cursor. */
export async function completedChunkCount(language: string): Promise<number> {
  const d = await openDb();
  const row = await d.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM session WHERE language = ? AND ended_at IS NOT NULL', language,
  );
  return row?.n ?? 0;
}

// ---- spend ----

export async function recordSpend(e: SpendEvent): Promise<void> {
  const d = await openDb();
  await d.runAsync(
    'INSERT INTO api_spend (at, provider, feature, units, unit, cost_usd) VALUES (?,?,?,?,?,?)',
    e.at, e.provider, e.feature, e.units, e.unit, e.costUsd,
  );
}

export async function spendEvents(sinceIso: string): Promise<SpendEvent[]> {
  const d = await openDb();
  const rows = await d.getAllAsync<{ at: string; provider: string; feature: string; units: number; unit: string; cost_usd: number }>(
    'SELECT at, provider, feature, units, unit, cost_usd FROM api_spend WHERE at >= ? ORDER BY at', sinceIso,
  );
  return rows.map((r) => ({ at: r.at, provider: r.provider, feature: r.feature, units: r.units, unit: r.unit, costUsd: r.cost_usd }));
}

// ---- in-progress session (real pause/resume; leaving a lesson never loses it) ----

export type SavedStepKey =
  | { k: 't'; id: string } // teach item
  | { k: 'p'; id: string; r: boolean; v: boolean } // prompt (isRecycle, isVictoryLap)
  | { k: 'a'; line: string }; // spoken announcement (system_lines key)

export interface SavedSessionProgress {
  sessionId: number;
  lessonRef: string;
  stepKeys: SavedStepKey[];
  stepIndex: number;
  newItemIds: string[];
  recycledItemIds: string[];
  isLastLesson: boolean;
}

export async function saveSessionProgress(language: string, p: SavedSessionProgress): Promise<void> {
  await setSetting(`session_progress.${language}`, JSON.stringify(p));
}

export async function loadSessionProgress(language: string): Promise<SavedSessionProgress | null> {
  const raw = await getSetting(`session_progress.${language}`, '');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedSessionProgress;
  } catch {
    return null;
  }
}

export async function clearSessionProgress(language: string): Promise<void> {
  const d = await openDb();
  await d.runAsync('DELETE FROM settings WHERE key = ?', `session_progress.${language}`);
}

/** Drop an abandoned (never-finished) session row. */
export async function deleteUnfinishedSession(id: number): Promise<void> {
  const d = await openDb();
  await d.runAsync('DELETE FROM session WHERE id = ? AND ended_at IS NULL', id);
}

// ---- settings ----

export async function getSetting(key: string, fallback: string): Promise<string> {
  const d = await openDb();
  const row = await d.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const d = await openDb();
  await d.runAsync(
    'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}

/** All settings rows whose key starts with `prefix` (LIKE wildcards escaped). */
export async function getSettingsByPrefix(prefix: string): Promise<{ key: string; value: string }[]> {
  const d = await openDb();
  const escaped = prefix.replace(/[\\%_]/g, (c) => `\\${c}`);
  return d.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key LIKE ? ESCAPE '\\'",
    `${escaped}%`,
  );
}

// ---- module progress (the fixed module spine drives map completion) ----

/** Ids of the modules the learner has finished, for a language. */
export async function getCompletedModuleIds(language: string): Promise<string[]> {
  const d = await openDb();
  const rows = await d.getAllAsync<{ module_id: string }>(
    'SELECT module_id FROM module_progress WHERE language = ?', language,
  );
  return rows.map((r) => r.module_id);
}

/** Mark a module done (idempotent — re-completing just refreshes the timestamp). */
export async function markModuleComplete(language: string, moduleId: string, now: Date): Promise<void> {
  const d = await openDb();
  await d.runAsync(
    'INSERT INTO module_progress (language, module_id, completed_at) VALUES (?,?,?) ' +
      'ON CONFLICT(language, module_id) DO UPDATE SET completed_at = excluded.completed_at',
    language, moduleId, now.toISOString(),
  );
}

/** Mark several modules done at once (catch-up: skip ahead to where you were). */
export async function markModulesComplete(language: string, moduleIds: string[], now: Date): Promise<void> {
  if (moduleIds.length === 0) return;
  const d = await openDb();
  const at = now.toISOString();
  await d.withTransactionAsync(async () => {
    for (const id of moduleIds) {
      await d.runAsync(
        'INSERT INTO module_progress (language, module_id, completed_at) VALUES (?,?,?) ' +
          'ON CONFLICT(language, module_id) DO UPDATE SET completed_at = excluded.completed_at',
        language, id, at,
      );
    }
  });
}

/** The module the learner is currently on; null until one is chosen. */
export async function getCurrentModuleId(language: string): Promise<string | null> {
  const v = await getSetting(`current_module.${language}`, '');
  return v || null;
}

export async function setCurrentModuleId(language: string, moduleId: string): Promise<void> {
  await setSetting(`current_module.${language}`, moduleId);
}

// ---- verbs reference caches (regenerable content; not exported, not in packs) ----

/** Every classified surface for a language (surface → lemma + pos + gloss). */
export async function getLexemes(language: string): Promise<Lexeme[]> {
  const d = await openDb();
  const rows = await d.getAllAsync<{ surface: string; lemma: string; pos: string; gloss_en: string }>(
    'SELECT surface, lemma, pos, gloss_en FROM lexeme WHERE language = ?',
    language,
  );
  return rows.map((r) => ({
    language,
    surface: r.surface,
    lemma: r.lemma,
    pos: r.pos as Lexeme['pos'],
    glossEn: r.gloss_en,
  }));
}

/** Cache a batch of classifications (idempotent per surface). */
export async function upsertLexemes(
  language: string,
  rows: readonly Omit<Lexeme, 'language'>[],
  now: Date,
): Promise<void> {
  if (rows.length === 0) return;
  const d = await openDb();
  const at = now.toISOString();
  await d.withTransactionAsync(async () => {
    for (const r of rows) {
      await d.runAsync(
        'INSERT INTO lexeme (language, surface, lemma, pos, gloss_en, classified_at) VALUES (?,?,?,?,?,?) ' +
          'ON CONFLICT(language, surface) DO UPDATE SET lemma = excluded.lemma, pos = excluded.pos, gloss_en = excluded.gloss_en, classified_at = excluded.classified_at',
        language, r.surface, r.lemma, r.pos, r.glossEn, at,
      );
    }
  });
}

/** The cached verb page, or null if absent or on a stale schema (→ regenerate). */
export async function getVerbEntry(language: string, lemma: string): Promise<VerbEntry | null> {
  const d = await openDb();
  const row = await d.getFirstAsync<{ payload_json: string; schema_version: number }>(
    'SELECT payload_json, schema_version FROM verb_entry WHERE language = ? AND lemma = ?',
    language,
    lemma,
  );
  if (!row || row.schema_version !== VERB_SCHEMA_VERSION) return null;
  try {
    return JSON.parse(row.payload_json) as VerbEntry;
  } catch {
    return null;
  }
}

/** Store a generated verb page so it never costs tokens again on this device. */
export async function putVerbEntry(
  language: string,
  lemma: string,
  entry: VerbEntry,
  model: string,
  now: Date,
): Promise<void> {
  const d = await openDb();
  await d.runAsync(
    'INSERT INTO verb_entry (language, lemma, payload_json, model, schema_version, generated_at) VALUES (?,?,?,?,?,?) ' +
      'ON CONFLICT(language, lemma) DO UPDATE SET payload_json = excluded.payload_json, model = excluded.model, schema_version = excluded.schema_version, generated_at = excluded.generated_at',
    language, lemma, JSON.stringify(entry), model, VERB_SCHEMA_VERSION, now.toISOString(),
  );
}

// ---- export / import (plan §7: progress only; content reloads from packs) ----

export async function exportProgress(): Promise<string> {
  const d = await openDb();
  const dump: Record<string, unknown[]> = {};
  for (const table of PROGRESS_TABLES) {
    dump[table] = await d.getAllAsync(`SELECT * FROM ${table}`);
  }
  return JSON.stringify({ exported_at: new Date().toISOString(), tables: dump }, null, 2);
}

export async function importProgress(json: string): Promise<void> {
  const d = await openDb();
  const parsed = JSON.parse(json) as { tables: Record<string, Record<string, unknown>[]> };
  await d.withTransactionAsync(async () => {
    for (const table of PROGRESS_TABLES) {
      const rows = parsed.tables[table];
      if (!rows) continue;
      await d.runAsync(`DELETE FROM ${table}`);
      for (const row of rows) {
        const cols = Object.keys(row);
        await d.runAsync(
          `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
          ...cols.map((c) => row[c] as SQLite.SQLiteBindValue),
        );
      }
    }
  });
}
