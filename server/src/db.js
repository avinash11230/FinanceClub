// Data layer. Uses libSQL (@libsql/client) — same SQLite dialect everywhere:
//   - Local dev:  a `file:` database (no account, no native build).
//   - Production: a remote Turso database via DATABASE_URL + DATABASE_AUTH_TOKEN.
// The whole app only touches the async helpers below (all / get / run / tx),
// so the storage backend is fully isolated here.
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

let url = process.env.DATABASE_URL;
if (!url) {
  // No remote DB configured → local file database for development.
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  url = 'file:' + path.join(DATA_DIR, 'arena.db');
}

export const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const toNum = (v) => (v == null ? undefined : Number(v));

// --- async query helpers ----------------------------------------------------
export async function all(sql, params = []) {
  const rs = await client.execute({ sql, args: params });
  return rs.rows;
}
export async function get(sql, params = []) {
  const rs = await client.execute({ sql, args: params });
  return rs.rows[0] ?? undefined;
}
export async function run(sql, params = []) {
  const rs = await client.execute({ sql, args: params });
  return { lastInsertRowid: toNum(rs.lastInsertRowid), changes: rs.rowsAffected };
}

// Interactive transaction. The callback receives an executor `q` with the same
// { all, get, run } shape, bound to the transaction. Rolls back on throw.
export async function tx(fn) {
  const t = await client.transaction('write');
  try {
    const q = {
      all: async (sql, params = []) => (await t.execute({ sql, args: params })).rows,
      get: async (sql, params = []) => (await t.execute({ sql, args: params })).rows[0] ?? undefined,
      run: async (sql, params = []) => {
        const r = await t.execute({ sql, args: params });
        return { lastInsertRowid: toNum(r.lastInsertRowid), changes: r.rowsAffected };
      },
    };
    const result = await fn(q);
    await t.commit();
    return result;
  } catch (err) {
    try { await t.rollback(); } catch { /* ignore */ }
    throw err;
  }
}

// --- schema -----------------------------------------------------------------
export async function migrate() {
  try { await client.execute('PRAGMA foreign_keys = ON'); } catch { /* not supported on some backends */ }
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS participants (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      verified       INTEGER NOT NULL DEFAULT 1,
      verify_code    TEXT,
      verify_expires TEXT,
      verify_sent_at TEXT,
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
      description  TEXT,
      metrics      TEXT,
      history      TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      round_number  INTEGER NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'pending',
      opened_at     TEXT,
      closes_at     TEXT,
      closed_at     TEXT,
      recap         TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS round_company_returns (
      round_id     INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      base_return  REAL NOT NULL DEFAULT 0,
      multipliers  TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (round_id, company_id)
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      round_id      INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (participant_id, round_id)
    );

    CREATE TABLE IF NOT EXISTS allocations (
      submission_id  INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      round_id       INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      amount         REAL NOT NULL DEFAULT 0,
      confidence     INTEGER NOT NULL DEFAULT 3,
      PRIMARY KEY (submission_id, company_id)
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id    INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS snapshot_company_returns (
      snapshot_id      INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      base_return      REAL NOT NULL,
      multiplier       REAL NOT NULL,
      gross_return     REAL NOT NULL,
      crowders_count   INTEGER NOT NULL,
      crowd_ratio      REAL NOT NULL,
      diluted          INTEGER NOT NULL,
      PRIMARY KEY (snapshot_id, company_id)
    );

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

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Additive migrations for databases created before a column existed.
  // (CREATE TABLE IF NOT EXISTS never alters an existing table.)
  await ensureColumns('participants', [
    ['verified', 'verified INTEGER NOT NULL DEFAULT 1'],
    ['verify_code', 'verify_code TEXT'],
    ['verify_expires', 'verify_expires TEXT'],
    ['verify_sent_at', 'verify_sent_at TEXT'],
  ]);
  // Compounded-wealth tracking per snapshot.
  await ensureColumns('scores', [
    ['capital_before', 'capital_before REAL'],
    ['round_pnl', 'round_pnl REAL'],
    ['capital_after', 'capital_after REAL'],
    ['cumulative_return', 'cumulative_return REAL'],
  ]);
}

// Adds any missing columns to an existing table (libSQL has no ADD COLUMN IF NOT EXISTS).
async function ensureColumns(table, columns) {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  const existing = new Set(info.rows.map((c) => c.name));
  for (const [name, def] of columns) {
    if (!existing.has(name)) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${def}`);
    }
  }
}

export async function getSetting(key, fallback = null) {
  const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}
export async function setSetting(key, value) {
  await run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)]
  );
}
