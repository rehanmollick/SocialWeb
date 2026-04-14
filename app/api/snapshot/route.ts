import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERSION = 1;

type SnapshotPerson = {
  name: string;
  bg: string;
  strength: number;
  tags: string[];
  description: string;
};

type SnapshotThought = {
  body: string;
  createdAt: number;
  mentions: string[];
};

type SnapshotEdge = {
  a: string;
  b: string;
  weight: number | null;
  deleted: boolean;
};

type Snapshot = {
  version: number;
  exportedAt: number;
  people: SnapshotPerson[];
  thoughts: SnapshotThought[];
  edges: SnapshotEdge[];
  bucketNames: Record<string, string>;
};

function safeTags(json: string): string[] {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const allPeople = await db.query.people.findMany();
  const allThoughts = await db.query.thoughts.findMany();
  const allMentions = await db.query.mentions.findMany();
  const allOverrides = await db.query.edgeOverrides.findMany();
  const allBuckets = await db.query.bucketNames.findMany();

  const idToName = new Map<number, string>(allPeople.map((p) => [p.id, p.name]));

  const mentionsByThought = new Map<number, string[]>();
  for (const m of allMentions) {
    const name = idToName.get(m.personId);
    if (!name) continue;
    const arr = mentionsByThought.get(m.thoughtId) ?? [];
    arr.push(name);
    mentionsByThought.set(m.thoughtId, arr);
  }

  const snapshot: Snapshot = {
    version: VERSION,
    exportedAt: Date.now(),
    people: allPeople.map((p) => ({
      name: p.name,
      bg: p.bg,
      strength: p.strength,
      tags: safeTags(p.tags),
      description: p.description ?? '',
    })),
    thoughts: allThoughts.map((t) => ({
      body: t.body,
      createdAt: t.createdAt,
      mentions: mentionsByThought.get(t.id) ?? [],
    })),
    edges: allOverrides
      .map((e) => {
        const a = idToName.get(e.aId);
        const b = idToName.get(e.bId);
        if (!a || !b) return null;
        return { a, b, weight: e.weight, deleted: e.deleted };
      })
      .filter((x): x is SnapshotEdge => x !== null),
    bucketNames: Object.fromEntries(allBuckets.map((r) => [r.bg, r.name])),
  };

  return new NextResponse(JSON.stringify(snapshot, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="socialweb-snapshot-${new Date(snapshot.exportedAt)
        .toISOString()
        .replace(/[:.]/g, '-')}.json"`,
    },
  });
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'snapshot must be an object' }, { status: 400 });
  }
  const snap = raw as Partial<Snapshot>;
  if (typeof snap.version !== 'number' || snap.version > VERSION) {
    return NextResponse.json({ error: 'unsupported snapshot version' }, { status: 400 });
  }
  if (!Array.isArray(snap.people)) {
    return NextResponse.json({ error: 'people array required' }, { status: 400 });
  }

  // wipe existing — caller is asking for a full restore
  await db.delete(schema.mentions);
  await db.delete(schema.edgeOverrides);
  await db.delete(schema.thoughts);
  await db.delete(schema.people);
  await db.delete(schema.bucketNames);

  const now = Date.now();
  const nameToId = new Map<string, number>();

  for (const p of snap.people) {
    if (!p || typeof p.name !== 'string' || !p.name.trim()) continue;
    const tags = Array.isArray(p.tags)
      ? p.tags.filter((t): t is string => typeof t === 'string')
      : [];
    const [created] = await db
      .insert(schema.people)
      .values({
        name: p.name.trim(),
        bg: typeof p.bg === 'string' ? p.bg : 'online',
        strength:
          typeof p.strength === 'number'
            ? Math.max(0, Math.min(10, p.strength))
            : 5,
        tags: JSON.stringify(tags),
        description: typeof p.description === 'string' ? p.description : '',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    nameToId.set(created.name, created.id);
  }

  if (Array.isArray(snap.thoughts)) {
    for (const t of snap.thoughts) {
      if (!t || typeof t.body !== 'string') continue;
      const [created] = await db
        .insert(schema.thoughts)
        .values({
          body: t.body,
          createdAt: typeof t.createdAt === 'number' ? t.createdAt : now,
        })
        .returning();
      const ms = Array.isArray(t.mentions) ? t.mentions : [];
      const rows = ms
        .map((name) => nameToId.get(name))
        .filter((id): id is number => typeof id === 'number')
        .map((personId) => ({ thoughtId: created.id, personId }));
      if (rows.length > 0) await db.insert(schema.mentions).values(rows);
    }
  }

  if (Array.isArray(snap.edges)) {
    for (const e of snap.edges) {
      if (!e) continue;
      const aId = nameToId.get(e.a);
      const bId = nameToId.get(e.b);
      if (typeof aId !== 'number' || typeof bId !== 'number' || aId === bId) continue;
      const [lo, hi] = aId < bId ? [aId, bId] : [bId, aId];
      await db.insert(schema.edgeOverrides).values({
        aId: lo,
        bId: hi,
        weight: typeof e.weight === 'number' ? e.weight : null,
        deleted: !!e.deleted,
      });
    }
  }

  if (snap.bucketNames && typeof snap.bucketNames === 'object') {
    for (const [bg, name] of Object.entries(snap.bucketNames)) {
      if (typeof name !== 'string' || !name.trim()) continue;
      await db.insert(schema.bucketNames).values({ bg, name: name.trim() });
    }
  }

  return NextResponse.json({
    ok: true,
    counts: {
      people: snap.people.length,
      thoughts: Array.isArray(snap.thoughts) ? snap.thoughts.length : 0,
      edges: Array.isArray(snap.edges) ? snap.edges.length : 0,
      bucketNames: snap.bucketNames ? Object.keys(snap.bucketNames).length : 0,
    },
  });
}
