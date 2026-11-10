import { ASK_MODEL } from "@/lib/ai";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    model: ASK_MODEL,
    storage: "local",
  });
}
