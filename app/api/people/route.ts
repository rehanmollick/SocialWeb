import { db, schema } from "@/lib/db";
import { personPatch, resolveSpatialHome } from "@/lib/people";
import { mutate } from "@/lib/history";
import { handle, payload, InputError } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return handle(async () => {
    const patch = personPatch(await payload(req));
    if (!patch.name) throw new InputError("Name is required.");
    const existing = db.query.people
      .findMany()
      .sync()
      .find((p) => p.name.toLowerCase() === patch.name!.toLowerCase());
    if (existing)
      throw new InputError("A person with this name already exists.", 409);
    const created = mutate(`Add ${patch.name}`, () => {
      resolveSpatialHome(patch);
      return db
        .insert(schema.people)
        .values({ ...patch, name: patch.name!, createdAt: Date.now() })
        .returning()
        .get();
    });
    return { ok: true, id: created.id };
  });
}
