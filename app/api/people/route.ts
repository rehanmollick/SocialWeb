import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    bg?: string;
    strength?: number;
    tags?: string[];
    description?: string;
  };
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const existing = await db.query.people.findFirst({ where: eq(schema.people.name, name) });
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, existed: true });
  }

  const now = Date.now();
  const bg = typeof body.bg === 'string' ? body.bg : 'online';
  const strength =
    typeof body.strength === 'number' ? Math.max(0, Math.min(10, body.strength)) : 5;
  const tags = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string') : [];
  const description = typeof body.description === 'string' ? body.description : '';

  const [created] = await db
    .insert(schema.people)
    .values({
      name,
      bg,
      strength,
      tags: JSON.stringify(tags),
      description,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json({ ok: true, id: created.id });
}
