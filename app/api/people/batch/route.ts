import { db, schema } from "@/lib/db";
import { personPatch, resolveSpatialHome } from "@/lib/people";
import { mutate } from "@/lib/history";
import { handle, payload, InputError } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return handle(async () => {
    const body = await payload(req);
    if (
      !Array.isArray(body.people) ||
      !body.people.length ||
      body.people.length > 100
    )
      throw new InputError("Add between 1 and 100 people at a time.");
    const patches = body.people.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new InputError("Invalid person.");
      const p = personPatch(value);
      if (!p.name) throw new InputError("Every person needs a name.");
      return p;
    });
    const ids = mutate(`Add ${patches.length} people`, () => {
      const names = new Set(
        db.query.people
          .findMany()
          .sync()
          .map((p) => p.name.toLowerCase()),
      );
      return patches.map((p) => {
        const name = p.name!;
        if (names.has(name.toLowerCase()))
          throw new InputError(
            `${name} already exists. No people were added.`,
            409,
          );
        names.add(name.toLowerCase());
        resolveSpatialHome(p);
        return db
          .insert(schema.people)
          .values({ ...p, name, createdAt: Date.now() })
          .returning()
          .get().id;
      });
    });
    return { ok: true, ids };
  });
}
