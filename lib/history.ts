import { db, rows, run, sql, transaction } from "./db";
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
export async function snapshot(): Promise<Snapshot> {
  const data = {} as Snapshot["tables"];
  for (const t of tables)
    data[t] = await rows(sql`SELECT * FROM ${sql.identifier(t)}`);
  return { version: 2, tables: data };
}
export async function validateSnapshot(raw: unknown): Promise<Snapshot> {
  if (!raw || typeof raw !== "object" || (raw as Snapshot).version !== 2)
    throw new Error("Choose a SocialWeb version 2 backup.");
  const data = (raw as Snapshot).tables;
  if (!data || typeof data !== "object") throw new Error("Invalid backup.");
  for (const table of tables) {
    if (!Array.isArray(data[table]) || data[table].length > 100000)
      throw new Error(`Invalid ${table} data.`);
    const columns = new Map(
      (
        await rows<{ name: string; type: string }>(
          sql.raw(`PRAGMA table_info(${table})`),
        )
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
// Call inside a transaction.
export async function restore(data: Snapshot) {
  for (const table of [...tables].reverse())
    await run(sql`DELETE FROM ${sql.identifier(table)}`);
  for (const table of tables)
    for (const row of data.tables[table]) {
      const keys = Object.keys(row);
      await run(
        sql`INSERT INTO ${sql.identifier(table)} (${sql.join(
          keys.map((k) => sql.identifier(k)),
          sql`,`,
        )}) VALUES (${sql.join(
          Object.values(row).map((v) => sql`${v}`),
          sql`,`,
        )})`,
      );
    }
}
// Run a change with a snapshot taken first, so Undo can put everything back.
export function mutate<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  return transaction(async () => {
    await run(
      sql`INSERT INTO history(label,snapshot,created_at) VALUES (${label},${JSON.stringify(await snapshot())},${Date.now()})`,
    );
    const result = await fn();
    await run(
      sql`DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 25)`,
    );
    return result;
  });
}
export { db };
