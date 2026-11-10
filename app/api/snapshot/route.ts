import { snapshot, validateSnapshot, mutate, restore } from "@/lib/history";
import { handle, InputError } from "@/lib/http";
import { ready } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  await ready();
  return new Response(JSON.stringify(await snapshot(), null, 2), {
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
      data = await validateSnapshot(await req.json());
    } catch (e) {
      throw new InputError(e instanceof Error ? e.message : "Invalid backup.");
    }
    await mutate("Restore backup", async () => restore(data));
    return { ok: true };
  });
}
