import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handle, payload, idValue, numberValue, InputError } from "@/lib/http";
import { mutate } from "@/lib/history";
export const runtime = "nodejs";
async function update(req: Request, deleted = false) {
  return handle(async () => {
    const body = await payload(req);
    const ids = [idValue(body.a), idValue(body.b)].sort((a, b) => a - b);
    const [a, b] = ids;
    const known = new Set((await db.query.people.findMany()).map((p) => p.id));
    if (a === b || ids.some((id) => !known.has(id)))
      throw new InputError("Choose two existing people.");
    const weight = deleted ? null : numberValue(body.weight ?? 3, 0, 10);
    await mutate(
      deleted ? "Remove connection" : "Edit connection",
      async () => {
        const old = await db.query.edgeOverrides.findFirst({
          where: and(
            eq(schema.edgeOverrides.aId, a),
            eq(schema.edgeOverrides.bId, b),
          ),
        });
        if (old)
          await db
            .update(schema.edgeOverrides)
            .set({ weight, deleted })
            .where(eq(schema.edgeOverrides.id, old.id))
            .run();
        else
          await db
            .insert(schema.edgeOverrides)
            .values({ aId: a, bId: b, weight, deleted })
            .run();
      },
    );
    return { ok: true };
  });
}
export const POST = (req: Request) => update(req);
export const PATCH = (req: Request) => update(req);
export const DELETE = (req: Request) => update(req, true);
