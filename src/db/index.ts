import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { PROGRESS_TABLES, SCHEMA_SQL } from './schema';
import type { CoursePack } from '../lib/content/types';
import { allLessons } from '../lib/content/types';
import type { MasteryState } from '../lib/scheduler/scheduler';
import type { SpendEvent } from '../lib/cost/meter';
import type { MatchResult } from '../lib/matching';

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
  const locales: Record<string, string> = { id: 'id-ID', zh: 'zh-CN', fr: 'fr-FR', it: 'it-IT', es: 'es-ES' };
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
