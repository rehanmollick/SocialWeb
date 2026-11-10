import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fileBrainDump } from "@/lib/filing";
import { mutate } from "@/lib/history";
import { stringList, today } from "@/lib/graph/types";
import { handle, payload, textValue, InputError } from "@/lib/http";
export const runtime = "nodejs";

type Item = {
  personId: number | null;
  name: string;
  bullets: string[];
  nextStep: string;
  circles: string[];
};

function items(raw: unknown): Item[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 30)
    throw new InputError("Choose at least one person to file under.");
  return raw.map((v) => {
    if (!v || typeof v !== "object") throw new InputError("Invalid item.");
    const item = v as Record<string, unknown>;
    const name = textValue(item.name, "name", 100);
    if (!name) throw new InputError("Every person needs a name.");
    return {
      personId:
        typeof item.personId === "number" && Number.isSafeInteger(item.personId)
          ? item.personId
          : null,
      name,
      bullets: stringList(item.bullets)
        .filter((b) => b.length <= 300)
        .slice(0, 8),
      nextStep: textValue(item.nextStep ?? "", "next step", 120),
      circles: stringList(item.circles)
        .filter((c) => c.length <= 40)
        .slice(0, 6),
    };
  });
}

// preview: Claude proposes where each bullet goes. Without preview: apply the
// reviewed items in one transaction, so a single Undo reverses the whole dump.
export async function POST(req: Request) {
  return handle(async () => {
    const body = await payload(req);
    const text = textValue(body.text, "note", 8000);
    if (!text) throw new InputError("Write something first.");
    if (body.preview === true) return { people: await fileBrainDump(text) };
    const reviewed = items(body.items);
    const filed = await mutate("File brain dump", async () => {
      const all = await db.query.people.findMany();
      const ids: number[] = [];
      for (const item of reviewed) {
        let person: (typeof all)[number] | undefined =
          all.find((p) => p.id === item.personId) ??
          all.find((p) => p.name.toLowerCase() === item.name.toLowerCase());
        if (!person) {
          person = await db
            .insert(schema.people)
            .values({ name: item.name, bg: "online", strength: 3 })
            .returning()
            .get();
          all.push(person);
        }
        const notes = [
          person.description.trimEnd(),
          ...item.bullets.map((b) => `• ${b.replace(/^[•\-*]\s*/, "")}`),
        ]
          .filter(Boolean)
          .join("\n");
        if (notes.length > 10000)
          throw new InputError(`${person.name}'s notes are full.`);
        const circles = stringList(person.circles);
        for (const c of item.circles)
          if (!circles.some((v) => v.toLowerCase() === c.toLowerCase()))
            circles.push(c);
        await db
          .update(schema.people)
          .set({
            description: notes,
            circles: JSON.stringify(circles),
            nextStep: item.nextStep || person.nextStep,
            lastContact: today(),
            updatedAt: Date.now(),
          })
          .where(eq(schema.people.id, person.id))
          .run();
        ids.push(person.id);
      }
      const memory = await db
        .insert(schema.thoughts)
        .values({ body: text, createdAt: Date.now() })
        .returning()
        .get();
      for (const id of new Set(ids))
        await db
          .insert(schema.mentions)
          .values({ thoughtId: memory.id, personId: id })
          .run();
      return ids.length;
    });
    return { ok: true, filed };
  });
}
