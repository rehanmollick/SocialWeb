import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  handle,
  payload,
  textValue,
  numberValue,
  InputError,
} from "@/lib/http";
import { mutate } from "@/lib/history";
export const runtime = "nodejs";
async function update(req: Request, remove = false) {
  return handle(async () => {
    const body = await payload(req);
    const [a, b] = [
      textValue(body.bgA, "group", 100),
      textValue(body.bgB, "group", 100),
    ].sort();
    const groups = new Set(
      db.query.people
        .findMany()
        .sync()
        .map((p) => p.bg),
    );
    if (a === b || !groups.has(a) || !groups.has(b))
      throw new InputError("Choose two populated groups.");
    const weight = remove ? 0 : numberValue(body.weight ?? 5, 0, 10);
    mutate(remove ? "Remove group connection" : "Edit group connection", () => {
      const where = and(
        eq(schema.clusterEdges.bgA, a),
        eq(schema.clusterEdges.bgB, b),
      );
      if (remove) {
        db.delete(schema.clusterEdges).where(where).run();
        return;
      }
      const existing = db.query.clusterEdges.findFirst({ where }).sync();
      if (existing)
        db.update(schema.clusterEdges).set({ weight }).where(where).run();
      else
        db.insert(schema.clusterEdges).values({ bgA: a, bgB: b, weight }).run();
    });
    return { ok: true };
  });
}
export const POST = (req: Request) => update(req);
export const PATCH = (req: Request) => update(req);
export const DELETE = (req: Request) => update(req, true);
