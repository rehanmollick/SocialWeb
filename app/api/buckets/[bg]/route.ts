import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Patch = {
  name?: string;
  meWeight?: number | null;
  meHidden?: boolean;
};

async function upsert(bg: string, patch: Partial<typeof schema.bucketNames.$inferInsert>) {
  const existing = await db.query.bucketNames.findFirst({ where: eq(schema.bucketNames.bg, bg) });
  if (existing) {
    await db.update(schema.bucketNames).set(patch).where(eq(schema.bucketNames.bg, bg));
  } else {
    await db.insert(schema.bucketNames).values({ bg, name: '', ...patch });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ bg: string }> }) {
  const { bg } = await ctx.params;
  if (!bg) return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  const body = (await req.json()) as Patch;
  const patch: Partial<typeof schema.bucketNames.$inferInsert> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim();
  if (body.meWeight === null) patch.meWeight = null;
  else if (typeof body.meWeight === 'number')
    patch.meWeight = Math.max(0, Math.min(10, body.meWeight));
  if (typeof body.meHidden === 'boolean') patch.meHidden = body.meHidden;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to patch' }, { status: 400 });
  }
  await upsert(bg, patch);
  return NextResponse.json({ ok: true });
}

// DELETE clears the row entirely — name, rope override, everything.
export async function DELETE(_req: Request, ctx: { params: Promise<{ bg: string }> }) {
  const { bg } = await ctx.params;
  await db.delete(schema.bucketNames).where(eq(schema.bucketNames.bg, bg));
  return NextResponse.json({ ok: true });
}
