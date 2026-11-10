import { eq, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { handle, payload, textValue, InputError } from "@/lib/http";
import { mutate } from "@/lib/history";
export const runtime = "nodejs";
type Context = { params: Promise<{ bg: string }> };
export async function PATCH(req: Request, { params }: Context) {
  return handle(async () => {
    const bg = textValue((await params).bg, "group", 100);
    const body = await payload(req);
    const name = textValue(body.name, "name", 100);
    if (!name) throw new InputError("Name the group.");
    await mutate("Rename group", async () =>
      db
        .insert(schema.bucketNames)
        .values({ bg, name })
        .onConflictDoUpdate({ target: schema.bucketNames.bg, set: { name } })
        .run(),
    );
    return { ok: true };
  });
}
export async function DELETE(_req: Request, { params }: Context) {
  return handle(async () => {
    const { bg } = await params;
    await mutate("Dissolve group", async () => {
      await db
        .update(schema.people)
        .set({ bg: "online", x: null, y: null })
        .where(eq(schema.people.bg, bg))
        .run();
      await db
        .delete(schema.bucketNames)
        .where(eq(schema.bucketNames.bg, bg))
        .run();
      await db
        .delete(schema.clusterEdges)
        .where(
          or(eq(schema.clusterEdges.bgA, bg), eq(schema.clusterEdges.bgB, bg)),
        )
        .run();
    });
    return { ok: true };
  });
}
