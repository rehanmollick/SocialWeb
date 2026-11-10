import { eq, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { personPatch, resolveSpatialHome } from "@/lib/people";
import { mutate } from "@/lib/history";
import { handle, payload, idValue, InputError } from "@/lib/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, { params }: Context) {
  return handle(async () => {
    const id = idValue((await params).id);
    const patch = personPatch(await payload(req));
    const person = await db.query.people.findFirst({
      where: eq(schema.people.id, id),
    });
    if (!person) throw new InputError("Person not found.", 404);
    if (
      patch.name &&
      (await db.query.people.findMany()).some(
        (p) =>
          p.id !== id && p.name.toLowerCase() === patch.name!.toLowerCase(),
      )
    )
      throw new InputError("That name already exists.", 409);
    await mutate(`Edit ${person.name}`, async () => {
      await resolveSpatialHome(patch);
      if (
        patch.bg &&
        patch.bg !== person.bg &&
        patch.x === undefined &&
        patch.y === undefined
      ) {
        patch.x = null;
        patch.y = null;
      }
      await db
        .update(schema.people)
        .set(patch)
        .where(eq(schema.people.id, id))
        .run();
    });
    return { ok: true };
  });
}
export async function DELETE(_req: Request, { params }: Context) {
  return handle(async () => {
    const id = idValue((await params).id);
    const p = await db.query.people.findFirst({
      where: eq(schema.people.id, id),
    });
    if (!p) throw new InputError("Person not found.", 404);
    await mutate(`Delete ${p.name}`, async () => {
      await db
        .delete(schema.edgeOverrides)
        .where(
          or(
            eq(schema.edgeOverrides.aId, id),
            eq(schema.edgeOverrides.bId, id),
          ),
        )
        .run();
      await db.delete(schema.people).where(eq(schema.people.id, id)).run();
    });
    return { ok: true };
  });
}
