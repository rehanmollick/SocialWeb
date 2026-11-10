import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

const DB_PATH = process.env.DB_PATH || "data/memory.db";

if (!existsSync(dirname(DB_PATH))) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
}

export const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    bg TEXT NOT NULL DEFAULT 'online',
    strength REAL NOT NULL DEFAULT 5,
    tags TEXT NOT NULL DEFAULT '[]',
    description TEXT NOT NULL DEFAULT '',
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
  CREATE TABLE IF NOT EXISTS cluster_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bg_a TEXT NOT NULL,
    bg_b TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 5,
    UNIQUE(bg_a, bg_b)
  );
`);

// Runtime migrations. Next's build and dev server load this module from several
// processes at once, so the check-then-ALTER must hold the write lock or two
// workers both see a missing column and the second one crashes.
sqlite.pragma("busy_timeout = 5000");
sqlite
  .transaction(() => {
    const addMissing = (table: string, columns: Record<string, string>) => {
      const existing = new Set(
        (
          sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
            name: string;
          }[]
        ).map((c) => c.name),
      );
      for (const [name, definition] of Object.entries(columns))
        if (!existing.has(name))
          sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    };
    addMissing("people", {
      description: "TEXT NOT NULL DEFAULT ''",
      pin_to_me: "INTEGER NOT NULL DEFAULT 0",
      x: "REAL",
      y: "REAL",
      circles: "TEXT NOT NULL DEFAULT '[]'",
      last_contact: "TEXT NOT NULL DEFAULT ''",
      follow_up: "TEXT NOT NULL DEFAULT ''",
      next_step: "TEXT NOT NULL DEFAULT ''",
    });
    addMissing("bucket_names", {
      me_weight: "REAL",
      me_hidden: "INTEGER NOT NULL DEFAULT 0",
    });
    sqlite.exec(
      `CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, snapshot TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    );
  })
  .immediate();


export const db = drizzle(sqlite, { schema });
export { schema };
