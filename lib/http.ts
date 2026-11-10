export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function payload(req: Request): Promise<Record<string, unknown>> {
  if (Number(req.headers.get("content-length")) > 5_000_000)
    throw new InputError("Request is too large.");
  const raw = await req.json().catch(() => {
    throw new InputError("Invalid JSON.");
  });
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new InputError("Expected an object.");
  return raw;
}
export function textValue(v: unknown, field: string, max = 10000) {
  if (typeof v !== "string" || v.length > max)
    throw new InputError(`Invalid ${field}.`);
  return v.trim();
}
export function idValue(v: unknown) {
  if (typeof v !== "number" && typeof v !== "string")
    throw new InputError("Invalid person ID.");
  const id = Number(v);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new InputError("Invalid person ID.");
  return id;
}
export function numberValue(v: unknown, min: number, max: number) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new InputError(`Expected a number between ${min} and ${max}.`);
  return v;
}
export async function handle(fn: () => unknown | Promise<unknown>) {
  try {
    const result = await fn();
    return result instanceof Response ? result : Response.json(result);
  } catch (e) {
    if (e instanceof InputError)
      return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.message.includes("UNIQUE constraint"))
      return Response.json(
        { error: "That name or connection already exists." },
        { status: 409 },
      );
    console.error(e);
    return Response.json(
      {
        error:
          "The request could not be completed. Your changes were not confirmed.",
      },
      { status: 500 },
    );
  }
}
