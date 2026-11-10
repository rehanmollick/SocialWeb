import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql, type SQL } from "drizzle-orm";
import * as schema from "./schema";

// One code path for both homes of the data: a SQLite file on this computer, or
// a hosted libSQL (Turso) database when TURSO_DATABASE_URL is set.
const remote = process.env.TURSO_DATABASE_URL?.trim();
const DB_PATH = process.env.DB_PATH || "data/memory.db";
if (!remote && !existsSync(dirname(DB_PATH)))
  mkdirSync(dirname(DB_PATH), { recursive: true });

export const storage = remote ? "cloud" : "local";
const client = createClient(
  remote
    ? { url: remote, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${DB_PATH}` },
);
const base = drizzle(client, { schema });
type Database = typeof base;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Code inside transaction() reaches the open transaction through `db` without
// having it passed down every call.
const scope = new AsyncLocalStorage<Transaction>();
export const db = new Proxy(base, {
  get(target, key) {
    const current = (scope.getStore() ?? target) as Database;
    const value = current[key as keyof Database];
    return typeof value === "function" ? value.bind(current) : value;
  },
}) as Database;

const TABLES = `
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
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;
const COLUMNS: Record<string, Record<string, string>> = {
  people: {
    description: "TEXT NOT NULL DEFAULT ''",
    pin_to_me: "INTEGER NOT NULL DEFAULT 0",
    x: "REAL",
    y: "REAL",
    circles: "TEXT NOT NULL DEFAULT '[]'",
    last_contact: "TEXT NOT NULL DEFAULT ''",
    follow_up: "TEXT NOT NULL DEFAULT ''",
    next_step: "TEXT NOT NULL DEFAULT ''",
  },
  bucket_names: {
    me_weight: "REAL",
    me_hidden: "INTEGER NOT NULL DEFAULT 0",
  },
};

// Bring an older database up to the current shape. The write transaction makes
// check-then-ALTER safe when several processes start at once.
async function migrate() {
  if (!remote) {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
  const tx = await client.transaction("write");
  try {
    await tx.executeMultiple(TABLES);
    for (const [table, columns] of Object.entries(COLUMNS)) {
      const existing = new Set(
        (await tx.execute(`PRAGMA table_info(${table})`)).rows.map((r) =>
          String(r.name),
        ),
      );
      for (const [name, definition] of Object.entries(columns))
        if (!existing.has(name))
          await tx.execute(
            `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`,
          );
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
}

let migrated: Promise<void> | undefined;
// Await before the first query of a request. A failed attempt is retried.
export function ready() {
  return (migrated ??= migrate().catch((e) => {
    migrated = undefined;
    throw e;
  }));
}

// Everything `fn` does through `db` commits or rolls back together.
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  await ready();
  if (scope.getStore()) return fn();
  return base.transaction((tx) => scope.run(tx, fn), { behavior: "immediate" });
}

export const rows = <T = Record<string, unknown>>(query: SQL) =>
  db.all<T>(query);
export const run = (query: SQL) => db.run(query);
export { schema, sql };
