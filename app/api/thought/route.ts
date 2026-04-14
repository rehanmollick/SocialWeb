import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { extractPeople } from '@/lib/extract';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { body } = await req.json().catch(() => ({ body: '' }));
  if (typeof body !== 'string' || !body.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 });
  }

  const extraction = await extractPeople(body);

  const now = Date.now();
  const [thought] = await db
    .insert(schema.thoughts)
    .values({ body, createdAt: now })
    .returning();

  const personIds: number[] = [];
  for (const p of extraction.people) {
    const existing = await db.query.people.findFirst({
      where: eq(schema.people.name, p.name),
    });
    if (existing) {
      const mergedTags = mergeTags(existing.tags, p.tags ?? []);
      const nextStrength = Math.min(10, existing.strength + 0.25);
      await db
        .update(schema.people)
        .set({
          strength: nextStrength,
          tags: JSON.stringify(mergedTags),
          bg: existing.bg || p.bg || 'online',
          updatedAt: now,
        })
        .where(eq(schema.people.id, existing.id));
      personIds.push(existing.id);
    } else {
      const [created] = await db
        .insert(schema.people)
        .values({
          name: p.name,
          bg: p.bg ?? 'online',
          strength: p.strengthHint ?? 5,
          tags: JSON.stringify(p.tags ?? []),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      personIds.push(created.id);
    }
  }

  if (personIds.length > 0) {
    await db.insert(schema.mentions).values(
      personIds.map((pid) => ({ thoughtId: thought.id, personId: pid }))
    );
  }

  return NextResponse.json({
    ok: true,
    thoughtId: thought.id,
    extracted: extraction.people.length,
  });
}

function mergeTags(existingJson: string, next: string[]): string[] {
  let base: string[] = [];
  try {
    const parsed = JSON.parse(existingJson);
    if (Array.isArray(parsed)) base = parsed.filter((t) => typeof t === 'string');
  } catch {}
  const set = new Set([...base, ...next]);
  return Array.from(set).slice(0, 6);
}
