import { sqlite } from "@/lib/db";
import { restore, validateSnapshot } from "@/lib/history";
import { handle, InputError } from "@/lib/http";
export const runtime = "nodejs";
export async function GET() {
  return Response.json({
    entries: sqlite
      .prepare(
        "SELECT id,label,created_at FROM history ORDER BY id DESC LIMIT 1",
      )
      .all(),
  });
}
export async function POST() {
  return handle(() =>
    sqlite.transaction(() => {
      const row = sqlite
        .prepare("SELECT * FROM history ORDER BY id DESC LIMIT 1")
        .get() as { id: number; snapshot: string; label: string } | undefined;
      if (!row) throw new InputError("Nothing to undo.");
      restore(validateSnapshot(JSON.parse(row.snapshot)));
      sqlite.prepare("DELETE FROM history WHERE id = ?").run(row.id);
      return { ok: true, label: row.label };
    })(),
  );
}
