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
    const person = db.query.people
      .findFirst({ where: eq(schema.people.id, id) })
      .sync();
    if (!person) throw new InputError("Person not found.", 404);
    if (
      patch.name &&
      db.query.people
        .findMany()
        .sync()
        .some(
          (p) =>
            p.id !== id && p.name.toLowerCase() === patch.name!.toLowerCase(),
        )
    )
      throw new InputError("That name already exists.", 409);
    mutate(`Edit ${person.name}`, () => {
      resolveSpatialHome(patch);
      if (
        patch.bg &&
        patch.bg !== person.bg &&
        patch.x === undefined &&
        patch.y === undefined
      ) {
        patch.x = null;
        patch.y = null;
      }
      db.update(schema.people).set(patch).where(eq(schema.people.id, id)).run();
    });
    return { ok: true };
  });
}
export async function DELETE(_req: Request, { params }: Context) {
  return handle(async () => {
    const id = idValue((await params).id);
    const p = db.query.people
      .findFirst({ where: eq(schema.people.id, id) })
      .sync();
    if (!p) throw new InputError("Person not found.", 404);
    mutate(`Delete ${p.name}`, () => {
      db.delete(schema.edgeOverrides)
        .where(
          or(
            eq(schema.edgeOverrides.aId, id),
            eq(schema.edgeOverrides.bId, id),
          ),
        )
        .run();
      db.delete(schema.people).where(eq(schema.people.id, id)).run();
    });
    return { ok: true };
  });
}
