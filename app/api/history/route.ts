import { rows, run, sql, transaction } from "@/lib/db";
import { restore, validateSnapshot } from "@/lib/history";
import { handle, InputError } from "@/lib/http";
export const runtime = "nodejs";
export async function GET() {
  return handle(async () => ({
    entries: await rows(
      sql`SELECT id,label,created_at FROM history ORDER BY id DESC LIMIT 1`,
    ),
  }));
}
export async function POST() {
  return handle(() =>
    transaction(async () => {
      const [row] = await rows<{ id: number; snapshot: string; label: string }>(
        sql`SELECT * FROM history ORDER BY id DESC LIMIT 1`,
      );
      if (!row) throw new InputError("Nothing to undo.");
      await restore(await validateSnapshot(JSON.parse(row.snapshot)));
      await run(sql`DELETE FROM history WHERE id = ${row.id}`);
      return { ok: true, label: row.label };
    }),
  );
}
