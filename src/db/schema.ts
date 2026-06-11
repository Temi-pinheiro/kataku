/** SQLite schema, plan §7. Content tables are read-mostly (loaded from the
 * JSON pack); the rest is the learner's progress and exports to JSON. */
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS language (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tts_voice TEXT,
  stt_locale TEXT NOT NULL,
  pack_version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS item (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  lesson_ref TEXT NOT NULL,
  type TEXT NOT NULL,
  concept_en TEXT NOT NULL,
  target_text TEXT NOT NULL,
  romanization TEXT
);

CREATE TABLE IF NOT EXISTS prompt (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  lesson_ref TEXT NOT NULL,
  cue_en TEXT NOT NULL,
  expected_json TEXT NOT NULL,
  components_json TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS mastery (
  item_id TEXT PRIMARY KEY,
  strength INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  due_at TEXT
);

CREATE TABLE IF NOT EXISTS attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id TEXT NOT NULL,
  at TEXT NOT NULL,
  transcript TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','near','miss')),
  think_ms INTEGER,
  retries INTEGER NOT NULL DEFAULT 0,
  audio_uri TEXT
);

CREATE TABLE IF NOT EXISTS session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  new_items INTEGER NOT NULL DEFAULT 0,
  prompts_done INTEGER NOT NULL DEFAULT 0,
  core_completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS weekly_review (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language TEXT NOT NULL,
  week_start TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  checkpoint_score INTEGER
);

CREATE TABLE IF NOT EXISTS api_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  provider TEXT NOT NULL,
  feature TEXT NOT NULL,
  units REAL NOT NULL,
  unit TEXT NOT NULL,
  cost_usd REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempt_prompt ON attempt(prompt_id, at);
CREATE INDEX IF NOT EXISTS idx_attempt_at ON attempt(at);
CREATE INDEX IF NOT EXISTS idx_spend_at ON api_spend(at);
CREATE INDEX IF NOT EXISTS idx_item_language ON item(language);
CREATE INDEX IF NOT EXISTS idx_prompt_language ON prompt(language);
`;

/** Progress tables included in JSON export/import (content tables reload from packs). */
export const PROGRESS_TABLES = ['mastery', 'attempt', 'session', 'weekly_review', 'api_spend', 'settings'] as const;
