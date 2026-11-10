import Anthropic from "@anthropic-ai/sdk";
import { InputError } from "./http";

// Ask reasons over the whole graph; filing notes is small, frequent work.
export const ASK_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const FAST_MODEL =
  process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-5-5";

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

export function aiClient() {
  if (!aiEnabled())
    throw new InputError(
      "Claude is not connected. Add ANTHROPIC_API_KEY to .env.local and restart the app. Your notes and manual edits work without it.",
      503,
    );
  return new Anthropic({ timeout: 60000, maxRetries: 1 });
}

export function aiFailure(e: unknown): never {
  if (e instanceof Anthropic.AuthenticationError)
    throw new InputError(
      "Claude could not authenticate. Check the API key on your server.",
      502,
    );
  if (e instanceof Anthropic.RateLimitError)
    throw new InputError(
      "Claude is temporarily rate limited. Try again shortly.",
      502,
    );
  if (e instanceof Anthropic.APIError)
    throw new InputError(
      "Claude could not answer right now. Your saved data is unchanged.",
      502,
    );
  throw e;
}

export function textOf(message: Anthropic.Message) {
  if ((message.stop_reason as string) === "refusal")
    throw new InputError("Claude declined that request.", 502);
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// One small request that must come back as JSON matching `schema`.
export async function structured<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const client = aiClient();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: FAST_MODEL,
      max_tokens: 6000,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low", format: { type: "json_schema", schema } },
    });
  } catch (e) {
    aiFailure(e);
  }
  if (message.stop_reason === "max_tokens")
    throw new InputError("That was too much to file at once. Try less.", 502);
  try {
    return JSON.parse(textOf(message)) as T;
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError("Claude returned something unreadable. Retry.", 502);
  }
}
