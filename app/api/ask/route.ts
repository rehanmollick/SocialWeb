import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { question } = (await req.json()) as { question?: string };
  if (!question || !question.trim()) {
    return NextResponse.json({ error: 'empty question' }, { status: 400 });
  }

  const people = await db.query.people.findMany();
  const thoughts = await db.query.thoughts.findMany({
    orderBy: [desc(schema.thoughts.createdAt)],
    limit: 30,
  });
  const mentions = await db.query.mentions.findMany();
  const buckets = await db.query.bucketNames.findMany();
  const customBgName = new Map(buckets.map((b) => [b.bg, b.name]));
  const labelFor = (bg: string) => customBgName.get(bg) ?? `${bg} (unnamed)`;

  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const mentionsByThought = new Map<number, string[]>();
  for (const m of mentions) {
    const name = nameById.get(m.personId);
    if (!name) continue;
    const arr = mentionsByThought.get(m.thoughtId) ?? [];
    arr.push(name);
    mentionsByThought.set(m.thoughtId, arr);
  }

  const peopleByBg = new Map<string, typeof people>();
  for (const p of people) {
    const arr = peopleByBg.get(p.bg) ?? [];
    arr.push(p);
    peopleByBg.set(p.bg, arr);
  }
  const clusterLines = Array.from(peopleByBg.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([bg, members]) => {
      const header = `${labelFor(bg)} [${bg}] — ${members.length} people:`;
      const rows = members
        .sort((a, b) => b.strength - a.strength)
        .map((p) => {
          const tags = safeTags(p.tags);
          const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';
          return `  - ${p.name} · strength ${p.strength.toFixed(1)}${tagStr}`;
        })
        .join('\n');
      return `${header}\n${rows}`;
    })
    .join('\n');

  const thoughtLines = thoughts
    .map((t) => {
      const refs = mentionsByThought.get(t.id) ?? [];
      const when = new Date(t.createdAt).toISOString().slice(0, 10);
      return `(${when}) ${t.body}${refs.length ? ` [mentions: ${refs.join(', ')}]` : ''}`;
    })
    .join('\n');

  const referencedPeople: string[] = [];

  const system = `You are the user's social memory. You answer questions about people they know using only the graph below. Be concrete, reference specific people and thoughts when relevant, and keep answers to 2-4 sentences. If the graph has no answer, say so plainly. Cluster names in quotes are the user's own labels for groups of people; refer to them by name when relevant.

PEOPLE GROUPED BY CLUSTER (${people.length} total):
${clusterLines || '(none yet)'}

RECENT THOUGHTS (${thoughts.length}):
${thoughtLines || '(none yet)'}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const hit = people.filter((p) => question.toLowerCase().includes(p.name.toLowerCase())).map((p) => p.name);
    return NextResponse.json({
      answer: `(stub — set ANTHROPIC_API_KEY for real answers) your graph has ${people.length} people and ${thoughts.length} thoughts.`,
      refs: hit,
    });
  }

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system,
    messages: [{ role: 'user', content: question.trim() }],
  });

  const answer = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  for (const p of people) {
    if (answer.includes(p.name)) referencedPeople.push(p.name);
  }

  return NextResponse.json({ answer, refs: referencedPeople });
}

function safeTags(json: string): string[] {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}
