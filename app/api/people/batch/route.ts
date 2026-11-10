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
    const ids = await mutate(`Add ${patches.length} people`, async () => {
      const names = new Set(
        (await db.query.people.findMany()).map((p) => p.name.toLowerCase()),
      );
      const created: number[] = [];
      for (const p of patches) {
        const name = p.name!;
        if (names.has(name.toLowerCase()))
          throw new InputError(
            `${name} already exists. No people were added.`,
            409,
          );
        names.add(name.toLowerCase());
        await resolveSpatialHome(p);
        created.push(
          (
            await db
              .insert(schema.people)
              .values({ ...p, name, createdAt: Date.now() })
              .returning()
              .get()
          ).id,
        );
      }
      return created;
    });
    return { ok: true, ids };
  });
}
