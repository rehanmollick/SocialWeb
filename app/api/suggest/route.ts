import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { suggestForProfile } from "@/lib/filing";
import { handle, payload, idValue, InputError } from "@/lib/http";
export const runtime = "nodejs";

// Suggestions only: nothing is written until the user taps one.
export async function POST(req: Request) {
  return handle(async () => {
    const id = idValue((await payload(req)).personId);
    const person = db.query.people
      .findFirst({ where: eq(schema.people.id, id) })
      .sync();
    if (!person) throw new InputError("Person not found.", 404);
    if (person.description.trim().length < 12)
      return { circles: [], nextStep: "" };
    return suggestForProfile(person);
  });
}
