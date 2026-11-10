import { snapshot, validateSnapshot, mutate, restore } from "@/lib/history";
import { handle, InputError } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return new Response(JSON.stringify(snapshot(), null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="socialweb-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    let data;
    try {
      data = validateSnapshot(await req.json());
    } catch (e) {
      throw new InputError(e instanceof Error ? e.message : "Invalid backup.");
    }
    mutate("Restore backup", () => restore(data));
    return { ok: true };
  });
}
