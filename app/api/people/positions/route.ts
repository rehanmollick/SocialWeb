import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  handle,
  payload,
  InputError,
  idValue,
  numberValue,
  textValue,
} from "@/lib/http";
import { mutate } from "@/lib/history";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return handle(async () => {
    const body = await payload(req);
    if (!Array.isArray(body.positions) || body.positions.length > 10000)
      throw new InputError("Invalid positions.");
    const points = body.positions.map((v: unknown) => {
      if (!v || typeof v !== "object")
        throw new InputError("Invalid position.");
      const p = v as Record<string, unknown>;
      return {
        id: idValue(p.id),
        x: p.x === null ? null : numberValue(p.x, -100000, 100000),
        y: p.y === null ? null : numberValue(p.y, -100000, 100000),
        ...(p.bg !== undefined
          ? { bg: textValue(p.bg, "Spatial group", 500) }
          : {}),
      };
    });
    await mutate("Arrange map", async () => {
      const ids = new Set((await db.query.people.findMany()).map((p) => p.id));
      if (
        points.some((p) => !ids.has(p.id) || p.bg === "") ||
        new Set(points.map((p) => p.id)).size !== points.length
      )
        throw new InputError("Invalid people in arrangement.");
      for (const { id, ...pos } of points)
        await db
          .update(schema.people)
          .set(pos)
          .where(eq(schema.people.id, id))
          .run();
    });
    return { ok: true };
  });
}
