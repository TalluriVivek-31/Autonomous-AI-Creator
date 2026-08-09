import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(__dirname, '../../data/agent.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- Agents initialized via POST /api/agent/init
    CREATE TABLE IF NOT EXISTS agents (
      agent_id    TEXT PRIMARY KEY,
      persona_json TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    -- Published posts (the canonical feed)
    CREATE TABLE IF NOT EXISTS posts (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL REFERENCES agents(agent_id),
      text        TEXT NOT NULL,
      rationale   TEXT NOT NULL,
      sources_json TEXT NOT NULL DEFAULT '[]',
      editorial_score INTEGER NOT NULL DEFAULT 0,
      tags_json   TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(id)
    );

    CREATE INDEX IF NOT EXISTS idx_posts_agent ON posts(agent_id, created_at DESC);

    -- Discovered topics (raw candidates before editorial)
    CREATE TABLE IF NOT EXISTS topics (
      id            TEXT PRIMARY KEY,
      agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
      title         TEXT NOT NULL,
      url           TEXT,
      source_name   TEXT,
      summary       TEXT,
      published_at  TEXT,
      discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      fingerprint   TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'PENDING',
      UNIQUE(fingerprint, agent_id)
    );

    CREATE INDEX IF NOT EXISTS idx_topics_agent ON topics(agent_id, discovered_at DESC);

    -- Editorial decisions for every evaluated topic
    CREATE TABLE IF NOT EXISTS editorial_log (
      id            TEXT PRIMARY KEY,
      agent_id      TEXT NOT NULL REFERENCES agents(agent_id),
      topic_id      TEXT REFERENCES topics(id),
      topic_title   TEXT NOT NULL,
      verdict       TEXT NOT NULL,
      total_score   INTEGER NOT NULL DEFAULT 0,
      criteria_json TEXT NOT NULL DEFAULT '{}',
      reason        TEXT,
      evaluated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_editorial_agent ON editorial_log(agent_id, evaluated_at DESC);

    -- Activity timeline events (pipeline steps)
    CREATE TABLE IF NOT EXISTS activity_events (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL REFERENCES agents(agent_id),
      event_type  TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_agent ON activity_events(agent_id, created_at DESC);

    -- Memory: semantic fingerprints of published content
    CREATE TABLE IF NOT EXISTS memory (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL REFERENCES agents(agent_id),
      type        TEXT NOT NULL,
      text        TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory(agent_id, created_at DESC);

    -- Scheduler state per agent
    CREATE TABLE IF NOT EXISTS scheduler_state (
      agent_id        TEXT PRIMARY KEY REFERENCES agents(agent_id),
      is_running      INTEGER NOT NULL DEFAULT 1,
      interval_seconds INTEGER NOT NULL DEFAULT 90,
      next_run_at     TEXT,
      last_run_at     TEXT,
      total_cycles    INTEGER NOT NULL DEFAULT 0,
      started_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
}

// ─── Generic helpers ─────────────────────────────────────────────────────────

export function dbRun(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}

export function dbGet(sql, params = []) {
  return getDb().prepare(sql).get(...params);
}

export function dbAll(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

export function dbTransaction(fn) {
  return getDb().transaction(fn)();
}

export { getDb };
