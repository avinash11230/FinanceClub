// Data layer. Wraps Node's built-in `node:sqlite` (zero native compilation).
// All SQL lives here or in the route/service files; the tiny query helpers
// below (`all`, `get`, `run`, `tx`) are the only surface the rest of the app
// touches, so moving to PostgreSQL later means rewriting just this file.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'arena.db');

export const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

// --- tiny query helpers -----------------------------------------------------
export function all(sql, params = []) {
  return sqlite.prepare(sql).all(...params);
}
export function get(sql, params = []) {
  return sqlite.prepare(sql).get(...params);
}
export function run(sql, params = []) {
  return sqlite.prepare(sql).run(...params);
}
export function tx(fn) {
  sqlite.exec('BEGIN');
  try {
    const result = fn();
    sqlite.exec('COMMIT');
    return result;
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
}

// --- schema -----------------------------------------------------------------
export function migrate() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS companies (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      ticker       TEXT,
      logo_url     TEXT,
      sector       TEXT,
      description  TEXT,            -- markdown
      metrics      TEXT,            -- markdown (deliberately qualitative / incomplete)
      history      TEXT,            -- markdown
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- A round is one reallocation window. status: pending | open | closed
    CREATE TABLE IF NOT EXISTS rounds (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      round_number  INTEGER NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'pending',
      opened_at     TEXT,
      closes_at     TEXT,           -- countdown target shown to participants
      closed_at     TEXT,
      recap         TEXT,           -- admin-written round recap (markdown)
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Admin-set base return % and multipliers per company per round (HIDDEN).
    -- multipliers is a JSON array of { label, value } applied multiplicatively.
    CREATE TABLE IF NOT EXISTS round_company_returns (
      round_id     INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      base_return  REAL NOT NULL DEFAULT 0,
      multipliers  TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (round_id, company_id)
    );

    -- One locked submission per participant per round.
    CREATE TABLE IF NOT EXISTS submissions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      round_id      INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (participant_id, round_id)
    );

    -- Individual company allocations belonging to a submission.
    CREATE TABLE IF NOT EXISTS allocations (
      submission_id  INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      round_id       INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      amount         REAL NOT NULL DEFAULT 0,    -- rupees
      confidence     INTEGER NOT NULL DEFAULT 3, -- 1..5
      PRIMARY KEY (submission_id, company_id)
    );

    -- Each leaderboard publish.
    CREATE TABLE IF NOT EXISTS snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id    INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Per-company computed returns for a snapshot (used for ghost portfolio + audit).
    CREATE TABLE IF NOT EXISTS snapshot_company_returns (
      snapshot_id      INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      base_return      REAL NOT NULL,
      multiplier       REAL NOT NULL,
      gross_return     REAL NOT NULL,  -- base * multiplier (before crowd dilution)
      crowders_count   INTEGER NOT NULL,
      crowd_ratio      REAL NOT NULL,
      diluted          INTEGER NOT NULL, -- 0/1
      PRIMARY KEY (snapshot_id, company_id)
    );

    -- Per-participant computed scores for a snapshot.
    CREATE TABLE IF NOT EXISTS scores (
      snapshot_id        INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      participant_id     INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      round_id           INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      portfolio_return   REAL NOT NULL,
      return_score       REAL NOT NULL,
      risk_score         REAL NOT NULL,
      consistency_score  REAL NOT NULL,
      overall_score      REAL NOT NULL,
      turnover           REAL NOT NULL,
      max_alloc_pct      REAL NOT NULL,
      companies_used     INTEGER NOT NULL,
      title              TEXT,
      rank_returns       INTEGER,
      rank_overall       INTEGER,
      prev_rank_returns  INTEGER,
      prev_rank_overall  INTEGER,
      PRIMARY KEY (snapshot_id, participant_id)
    );

    -- Simple key/value settings (e.g. competition_ended).
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)]
  );
}
