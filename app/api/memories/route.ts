import { eq, desc } from "drizzle-orm";
import { db, ready, schema } from "@/lib/db";
import { extractPeople } from "@/lib/extract";
import { mutate } from "@/lib/history";
import { handle, payload, textValue, idValue, InputError } from "@/lib/http";
export const runtime = "nodejs";
export async function GET() {
  await ready();
  const people = await db.query.people.findMany();
  const mentions = await db.query.mentions.findMany();
  return Response.json({
    thoughts: (
      await db.query.thoughts.findMany({
        orderBy: [desc(schema.thoughts.createdAt)],
      })
    ).map((t) => {
      const ids = mentions
        .filter((m) => m.thoughtId === t.id)
        .map((m) => m.personId);
      return {
        ...t,
        createdAt: new Date(t.createdAt).toISOString(),
        personIds: ids,
        mentions: people.filter((p) => ids.includes(p.id)).map((p) => p.name),
      };
    }),
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    const body = await payload(req);
    const text = textValue(body.body, "memory");
    if (!text) throw new InputError("Write a memory first.");
    if (body.preview === true) {
      const result = await extractPeople(text);
      return {
        suggestions: result.people,
        ai: Boolean(process.env.ANTHROPIC_API_KEY),
      };
    }
    if (!Array.isArray(body.personIds))
      throw new InputError("Select the people mentioned.");
    const ids = [...new Set(body.personIds.map(idValue))];
    const known = new Set((await db.query.people.findMany()).map((p) => p.id));
    if (ids.some((id) => !known.has(id)))
      throw new InputError("One of those people no longer exists.");
    const created = await mutate("Save memory", async () => {
      const t = await db
        .insert(schema.thoughts)
        .values({ body: text, createdAt: Date.now() })
        .returning()
        .get();
      for (const id of ids)
        await db
          .insert(schema.mentions)
          .values({ thoughtId: t.id, personId: id })
          .run();
      return t;
    });
    return { ok: true, id: created.id };
  });
}
export async function DELETE(req: Request) {
  return handle(async () => {
    const id = idValue((await payload(req)).id);
    await mutate(
      "Delete memory",
      async () =>
        await db
          .delete(schema.thoughts)
          .where(eq(schema.thoughts.id, id))
          .run(),
    );
    return { ok: true };
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const body = await payload(req);
    const id = idValue(body.id);
    const text = textValue(body.body, "memory");
    if (!text) throw new InputError("Write a memory first.");
    if (
      !(await db.query.thoughts.findFirst({
        where: eq(schema.thoughts.id, id),
      }))
    )
      throw new InputError("Memory not found.", 404);
    if (!Array.isArray(body.personIds))
      throw new InputError("Select the people mentioned.");
    const ids = [...new Set(body.personIds.map(idValue))];
    const known = new Set((await db.query.people.findMany()).map((p) => p.id));
    if (ids.some((pid) => !known.has(pid)))
      throw new InputError("A selected person no longer exists.");
    await mutate("Edit memory", async () => {
      await db
        .update(schema.thoughts)
        .set({ body: text })
        .where(eq(schema.thoughts.id, id))
        .run();
      await db
        .delete(schema.mentions)
        .where(eq(schema.mentions.thoughtId, id))
        .run();
      for (const personId of ids)
        await db
          .insert(schema.mentions)
          .values({ thoughtId: id, personId })
          .run();
    });
    return { ok: true };
  });
}
