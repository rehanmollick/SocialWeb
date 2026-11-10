import { sqlite } from "./db";
const tables = [
  "people",
  "thoughts",
  "mentions",
  "edge_overrides",
  "bucket_names",
  "cluster_edges",
] as const;
type Table = (typeof tables)[number];
export type Snapshot = {
  version: 2;
  tables: Record<Table, Record<string, unknown>[]>;
};
export function snapshot(): Snapshot {
  return {
    version: 2,
    tables: Object.fromEntries(
      tables.map((t) => [t, sqlite.prepare(`SELECT * FROM ${t}`).all()]),
    ) as Snapshot["tables"],
  };
}
export function validateSnapshot(raw: unknown): Snapshot {
  if (!raw || typeof raw !== "object" || (raw as Snapshot).version !== 2)
    throw new Error("Choose a SocialWeb version 2 backup.");
  const data = (raw as Snapshot).tables;
  if (!data || typeof data !== "object") throw new Error("Invalid backup.");
  for (const table of tables) {
    if (!Array.isArray(data[table]) || data[table].length > 100000)
      throw new Error(`Invalid ${table} data.`);
    const columns = new Map(
      (
        sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
          name: string;
          type: string;
        }[]
      ).map((c) => [c.name, c.type]),
    );
    for (const row of data[table]) {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.keys(row).length === 0
      )
        throw new Error("Invalid record.");
      for (const [key, value] of Object.entries(row)) {
        if (
          !columns.has(key) ||
          (value !== null &&
            typeof value !== "string" &&
            (typeof value !== "number" || !Number.isFinite(value)))
        )
          throw new Error("Invalid field in backup.");
        if (
          value !== null &&
          ((columns.get(key) === "TEXT" && typeof value !== "string") ||
            (columns.get(key) !== "TEXT" && typeof value !== "number"))
        )
          throw new Error(`Invalid type for ${table}.${key}.`);
        if (
          (key === "tags" || key === "circles") &&
          typeof value === "string"
        ) {
          let parsed;
          try {
            parsed = JSON.parse(value);
          } catch {
            throw new Error(`Invalid ${key}.`);
          }
          if (
            !Array.isArray(parsed) ||
            parsed.some((v) => typeof v !== "string")
          )
            throw new Error(`Invalid ${key}.`);
        }
        if (
          key === "strength" &&
          (typeof value !== "number" || value < 0 || value > 10)
        )
          throw new Error("Invalid closeness.");
      }
    }
  }
  // SQL constraints are additionally checked inside the restore transaction.
  return raw as Snapshot;
}
export function restore(data: Snapshot) {
  for (const table of [...tables].reverse())
    sqlite.prepare(`DELETE FROM ${table}`).run();
  for (const table of tables)
    for (const row of data.tables[table]) {
      const keys = Object.keys(row);
      sqlite
        .prepare(
          `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
        )
        .run(...Object.values(row));
    }
}
export function mutate<T>(label: string, fn: () => T): T {
  return sqlite.transaction(() => {
    sqlite
      .prepare("INSERT INTO history(label,snapshot,created_at) VALUES (?,?,?)")
      .run(label, JSON.stringify(snapshot()), Date.now());
    const result = fn();
    sqlite
      .prepare(
        "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 25)",
      )
      .run();
    return result;
  })();
}
