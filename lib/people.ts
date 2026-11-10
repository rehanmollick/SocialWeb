import { InputError, numberValue, textValue } from "./http";
import { stringList } from "./graph/types";
import { db, schema } from "./db";

// Call inside the same transaction as the person write, so Undo is one action.
export function resolveSpatialHome(
  patch: Partial<typeof schema.people.$inferInsert>,
) {
  if (!patch.bg?.startsWith("group:")) return;
  const name = patch.bg.slice(6).trim();
  if (!name || name.length > 80)
    throw new InputError("Choose a group name under 80 characters.");
  const existing = db.query.bucketNames
    .findMany()
    .sync()
    .find((g) => g.name.toLowerCase() === name.toLowerCase());
  patch.bg = existing?.bg ?? `g-${crypto.randomUUID()}`;
  if (!existing)
    db.insert(schema.bucketNames).values({ bg: patch.bg, name }).run();
}
export function personPatch(body: Record<string, unknown>) {
  const patch: Partial<typeof schema.people.$inferInsert> = {
    updatedAt: Date.now(),
  };
  for (const key of [
    "name",
    "bg",
    "description",
    "lastContact",
    "followUp",
    "nextStep",
  ] as const) {
    if (!(key in body)) continue;
    const value = textValue(
      body[key],
      key,
      key === "description" ? 10000 : 500,
    );
    if ((key === "name" || key === "bg") && !value)
      throw new InputError(`${key} is required.`);
    if (
      (key === "lastContact" || key === "followUp") &&
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    )
      throw new InputError("Use a valid date.");
    patch[key] = value;
  }
  for (const key of ["tags", "circles"] as const)
    if (key in body) {
      if (
        !Array.isArray(body[key]) ||
        (body[key] as unknown[]).some(
          (v) => typeof v !== "string" || v.length > 80,
        )
      )
        throw new InputError(`Invalid ${key}.`);
      patch[key] = JSON.stringify(stringList(body[key]));
    }
  if ("strength" in body) patch.strength = numberValue(body.strength, 0, 10);
  if ("pinToMe" in body) {
    if (typeof body.pinToMe !== "boolean") throw new InputError("Invalid pin.");
    patch.pinToMe = body.pinToMe;
  }
  for (const key of ["x", "y"] as const)
    if (key in body)
      patch[key] =
        body[key] === null ? null : numberValue(body[key], -100000, 100000);
  if (body.clearPosition) {
    patch.x = null;
    patch.y = null;
  }
  return patch;
}
