import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BG_LABELS: Record<string, string> = {
  plano: 'plano east (high school)',
  ut: 'ut austin (college)',
  allen: 'allen (grew up)',
  sf: 'sf / work',
  family: 'family',
  climb: 'climbing gym',
  online: 'online',
};

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

  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const mentionsByThought = new Map<number, string[]>();
  for (const m of mentions) {
    const name = nameById.get(m.personId);
    if (!name) continue;
    const arr = mentionsByThought.get(m.thoughtId) ?? [];
    arr.push(name);
    mentionsByThought.set(m.thoughtId, arr);
  }

  const peopleLines = people
    .map((p) => {
      const tags = safeTags(p.tags);
      const tagStr = tags.length ? ` [${tags.join(', ')}]` : '';
      return `- ${p.name} · ${BG_LABELS[p.bg] ?? p.bg} · strength ${p.strength.toFixed(1)}${tagStr}`;
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

  const system = `You are the user's social memory. You answer questions about people they know using only the graph below. Be concrete, reference specific people and thoughts when relevant, and keep answers to 2-4 sentences. If the graph has no answer, say so plainly.

PEOPLE (${people.length}):
${peopleLines || '(none yet)'}

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
