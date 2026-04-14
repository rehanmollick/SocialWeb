import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Pt = { id: number; x: number | null; y: number | null };

export async function POST(req: Request) {
  const body = (await req.json()) as { positions?: Pt[] };
  const positions = Array.isArray(body.positions) ? body.positions : [];
  if (positions.length === 0) {
    return NextResponse.json({ error: 'no positions' }, { status: 400 });
  }
  const now = Date.now();
  for (const p of positions) {
    if (typeof p.id !== 'number') continue;
    const x = p.x == null ? null : Number(p.x);
    const y = p.y == null ? null : Number(p.y);
    await db
      .update(schema.people)
      .set({ x, y, updatedAt: now })
      .where(eq(schema.people.id, p.id));
  }
  return NextResponse.json({ ok: true, count: positions.length });
}
