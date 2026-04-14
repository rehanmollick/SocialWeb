import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function POST(req: Request) {
  const body = (await req.json()) as { bgA?: string; bgB?: string; weight?: number };
  if (!body.bgA || !body.bgB || body.bgA === body.bgB) {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }
  const [a, b] = orderPair(body.bgA, body.bgB);
  const w = typeof body.weight === 'number' ? Math.max(0, Math.min(10, body.weight)) : 5;
  const existing = await db.query.clusterEdges.findFirst({
    where: and(eq(schema.clusterEdges.bgA, a), eq(schema.clusterEdges.bgB, b)),
  });
  if (existing) {
    await db
      .update(schema.clusterEdges)
      .set({ weight: w })
      .where(eq(schema.clusterEdges.id, existing.id));
  } else {
    await db.insert(schema.clusterEdges).values({ bgA: a, bgB: b, weight: w });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { bgA?: string; bgB?: string; weight?: number };
  if (!body.bgA || !body.bgB || typeof body.weight !== 'number') {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }
  const [a, b] = orderPair(body.bgA, body.bgB);
  const w = Math.max(0, Math.min(10, body.weight));
  await db
    .update(schema.clusterEdges)
    .set({ weight: w })
    .where(and(eq(schema.clusterEdges.bgA, a), eq(schema.clusterEdges.bgB, b)));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = (await req.json()) as { bgA?: string; bgB?: string };
  if (!body.bgA || !body.bgB) {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }
  const [a, b] = orderPair(body.bgA, body.bgB);
  await db
    .delete(schema.clusterEdges)
    .where(and(eq(schema.clusterEdges.bgA, a), eq(schema.clusterEdges.bgB, b)));
  return NextResponse.json({ ok: true });
}
