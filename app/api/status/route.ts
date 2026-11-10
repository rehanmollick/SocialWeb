export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
    storage: "local",
  });
}
