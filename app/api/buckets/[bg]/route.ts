import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, ctx: { params: Promise<{ bg: string }> }) {
  const { bg } = await ctx.params;
  const body = (await req.json()) as { name?: string };
  const name = (body.name ?? '').trim();
  if (!bg || !name) return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  const existing = await db.query.bucketNames.findFirst({ where: eq(schema.bucketNames.bg, bg) });
  if (existing) {
    await db.update(schema.bucketNames).set({ name }).where(eq(schema.bucketNames.bg, bg));
  } else {
    await db.insert(schema.bucketNames).values({ bg, name });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ bg: string }> }) {
  const { bg } = await ctx.params;
  await db.delete(schema.bucketNames).where(eq(schema.bucketNames.bg, bg));
  return NextResponse.json({ ok: true });
}
