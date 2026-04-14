import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await db.query.thoughts.findMany({
    orderBy: [desc(schema.thoughts.createdAt)],
    limit: 50,
  });

  const allMentions = await db.query.mentions.findMany();
  const allPeople = await db.query.people.findMany();
  const nameById = new Map(allPeople.map((p) => [p.id, p.name]));
  const mentionsByThought = new Map<number, string[]>();
  for (const m of allMentions) {
    const name = nameById.get(m.personId);
    if (!name) continue;
    const arr = mentionsByThought.get(m.thoughtId) ?? [];
    arr.push(name);
    mentionsByThought.set(m.thoughtId, arr);
  }

  const thoughts = rows.map((t) => ({
    id: t.id,
    body: t.body,
    createdAt: new Date(t.createdAt).toISOString(),
    mentions: mentionsByThought.get(t.id) ?? [],
  }));

  return NextResponse.json({ thoughts });
}
