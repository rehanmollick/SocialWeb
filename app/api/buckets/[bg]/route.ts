import { NextResponse } from 'next/server';
import { eq, inArray, or } from 'drizzle-orm';
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

// DELETE clears the bucket_names row (name, rope override). With
// ?withPeople=1 it ALSO wipes every person in this bg, any edge
// overrides that reference them, and any cluster_edges touching the bg.
// This is the "delete the whole accidental cluster" path.
export async function DELETE(req: Request, ctx: { params: Promise<{ bg: string }> }) {
  const { bg } = await ctx.params;
  const url = new URL(req.url);
  const withPeople = url.searchParams.get('withPeople') === '1';

  if (withPeople) {
    const members = await db.query.people.findMany({ where: eq(schema.people.bg, bg) });
    const ids = members.map((m) => m.id);
    if (ids.length > 0) {
      // edge_overrides has no FK to people — clean it up manually
      await db
        .delete(schema.edgeOverrides)
        .where(
          or(inArray(schema.edgeOverrides.aId, ids), inArray(schema.edgeOverrides.bId, ids)),
        );
      // mentions cascade on people delete via FK ON DELETE CASCADE
      await db.delete(schema.people).where(inArray(schema.people.id, ids));
    }
    // wipe any cluster_edges anchored to this bg
    await db
      .delete(schema.clusterEdges)
      .where(or(eq(schema.clusterEdges.bgA, bg), eq(schema.clusterEdges.bgB, bg)));
  }

  await db.delete(schema.bucketNames).where(eq(schema.bucketNames.bg, bg));
  return NextResponse.json({ ok: true });
}
