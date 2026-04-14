import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

const DB_PATH = process.env.DB_PATH || 'data/memory.db';

if (!existsSync(dirname(DB_PATH))) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    bg TEXT NOT NULL DEFAULT 'online',
    strength REAL NOT NULL DEFAULT 5,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS thoughts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thought_id INTEGER NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_mentions_thought ON mentions(thought_id);
  CREATE INDEX IF NOT EXISTS idx_mentions_person ON mentions(person_id);
  CREATE TABLE IF NOT EXISTS edge_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    a_id INTEGER NOT NULL,
    b_id INTEGER NOT NULL,
    weight REAL,
    deleted INTEGER NOT NULL DEFAULT 0,
    UNIQUE(a_id, b_id)
  );
  CREATE TABLE IF NOT EXISTS bucket_names (
    bg TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite, { schema });
export { schema };
