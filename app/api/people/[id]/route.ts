import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const body = (await req.json()) as { strength?: number; tags?: string[]; bg?: string };

  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (typeof body.strength === 'number') patch.strength = Math.max(0, Math.min(10, body.strength));
  if (Array.isArray(body.tags)) patch.tags = JSON.stringify(body.tags.filter((t) => typeof t === 'string'));
  if (typeof body.bg === 'string') patch.bg = body.bg;

  await db.update(schema.people).set(patch).where(eq(schema.people.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  await db.delete(schema.people).where(eq(schema.people.id, id));
  return NextResponse.json({ ok: true });
}
