import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ordered(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

async function upsert(aId: number, bId: number, patch: { weight?: number | null; deleted?: boolean }) {
  const existing = await db.query.edgeOverrides.findFirst({
    where: and(eq(schema.edgeOverrides.aId, aId), eq(schema.edgeOverrides.bId, bId)),
  });
  if (existing) {
    await db
      .update(schema.edgeOverrides)
      .set(patch)
      .where(eq(schema.edgeOverrides.id, existing.id));
  } else {
    await db.insert(schema.edgeOverrides).values({
      aId,
      bId,
      weight: patch.weight ?? null,
      deleted: patch.deleted ?? false,
    });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as { a: number; b: number; weight?: number };
  if (!Number.isFinite(body.a) || !Number.isFinite(body.b) || body.a === body.b) {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }
  const [a, b] = ordered(body.a, body.b);
  const weight = typeof body.weight === 'number' ? Math.max(0, body.weight) : 1;
  await upsert(a, b, { weight, deleted: false });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { a: number; b: number; weight: number };
  if (!Number.isFinite(body.a) || !Number.isFinite(body.b) || !Number.isFinite(body.weight)) {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }
  const [a, b] = ordered(body.a, body.b);
  await upsert(a, b, { weight: Math.max(0, body.weight), deleted: false });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = (await req.json()) as { a: number; b: number };
  if (!Number.isFinite(body.a) || !Number.isFinite(body.b)) {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 });
  }
  const [a, b] = ordered(body.a, body.b);
  await upsert(a, b, { deleted: true });
  return NextResponse.json({ ok: true });
}
