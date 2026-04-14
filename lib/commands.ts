import { and, eq, like, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { extractPeople } from '@/lib/extract';

const BG_VALUES = ['plano', 'ut', 'allen', 'sf', 'family', 'climb', 'online'] as const;
type Bg = (typeof BG_VALUES)[number];
const isBg = (v: unknown): v is Bg =>
  typeof v === 'string' && (BG_VALUES as readonly string[]).includes(v);

function orderedIds(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

async function findPerson(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const exact = await db.query.people.findFirst({
    where: eq(schema.people.name, trimmed),
  });
  if (exact) return exact;
  return await db.query.people.findFirst({
    where: or(
      like(schema.people.name, `${trimmed}%`),
      like(schema.people.name, `% ${trimmed}%`),
      like(schema.people.name, `%${trimmed}%`)
    ),
  });
}

async function ensurePerson(name: string, bg: Bg = 'online') {
  const existing = await findPerson(name);
  if (existing) return existing;
  const now = Date.now();
  const [created] = await db
    .insert(schema.people)
    .values({
      name: name.trim(),
      bg,
      strength: 5,
      tags: '[]',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return created;
}

function parseTags(json: string): string[] {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

async function upsertEdge(
  aId: number,
  bId: number,
  patch: { weight?: number | null; deleted?: boolean }
) {
  const [a, b] = orderedIds(aId, bId);
  const existing = await db.query.edgeOverrides.findFirst({
    where: and(eq(schema.edgeOverrides.aId, a), eq(schema.edgeOverrides.bId, b)),
  });
  if (existing) {
    await db
      .update(schema.edgeOverrides)
      .set(patch)
      .where(eq(schema.edgeOverrides.id, existing.id));
  } else {
    await db.insert(schema.edgeOverrides).values({
      aId: a,
      bId: b,
      weight: patch.weight ?? null,
      deleted: patch.deleted ?? false,
    });
  }
}

export type ToolResult = { ok: boolean; message: string };

export async function logThought(body: string): Promise<ToolResult> {
  if (!body.trim()) return { ok: false, message: 'empty thought' };
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
      const base = parseTags(existing.tags);
      const merged = Array.from(new Set([...base, ...(p.tags ?? [])])).slice(0, 6);
      await db
        .update(schema.people)
        .set({
          strength: Math.min(10, existing.strength + 0.25),
          tags: JSON.stringify(merged),
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
    await db
      .insert(schema.mentions)
      .values(personIds.map((pid) => ({ thoughtId: thought.id, personId: pid })));
  }
  return { ok: true, message: `logged thought, ${personIds.length} person(s)` };
}

export async function connectPeople(
  nameA: string,
  nameB: string,
  weight = 3
): Promise<ToolResult> {
  const a = await ensurePerson(nameA);
  const b = await ensurePerson(nameB);
  if (a.id === b.id) return { ok: false, message: 'same person' };
  await upsertEdge(a.id, b.id, { weight: Math.max(0, weight), deleted: false });
  return { ok: true, message: `connected ${a.name} ↔ ${b.name} (${weight})` };
}

export async function disconnectPeople(
  nameA: string,
  nameB: string
): Promise<ToolResult> {
  const a = await findPerson(nameA);
  const b = await findPerson(nameB);
  if (!a || !b) return { ok: false, message: 'person not found' };
  await upsertEdge(a.id, b.id, { deleted: true });
  return { ok: true, message: `disconnected ${a.name} ↔ ${b.name}` };
}

export async function setTags(name: string, tags: string[]): Promise<ToolResult> {
  const p = await ensurePerson(name);
  const clean = tags.filter((t) => typeof t === 'string' && t.trim()).slice(0, 8);
  await db
    .update(schema.people)
    .set({ tags: JSON.stringify(clean), updatedAt: Date.now() })
    .where(eq(schema.people.id, p.id));
  return { ok: true, message: `tags on ${p.name}: ${clean.join(', ')}` };
}

export async function addTag(name: string, tag: string): Promise<ToolResult> {
  const p = await ensurePerson(name);
  const base = parseTags(p.tags);
  if (!base.includes(tag)) base.push(tag);
  await db
    .update(schema.people)
    .set({ tags: JSON.stringify(base.slice(0, 8)), updatedAt: Date.now() })
    .where(eq(schema.people.id, p.id));
  return { ok: true, message: `+${tag} on ${p.name}` };
}

export async function removeTag(name: string, tag: string): Promise<ToolResult> {
  const p = await findPerson(name);
  if (!p) return { ok: false, message: 'person not found' };
  const base = parseTags(p.tags).filter((t) => t !== tag);
  await db
    .update(schema.people)
    .set({ tags: JSON.stringify(base), updatedAt: Date.now() })
    .where(eq(schema.people.id, p.id));
  return { ok: true, message: `-${tag} on ${p.name}` };
}

export async function setStrength(name: string, strength: number): Promise<ToolResult> {
  const p = await ensurePerson(name);
  const s = Math.max(0, Math.min(10, strength));
  await db
    .update(schema.people)
    .set({ strength: s, updatedAt: Date.now() })
    .where(eq(schema.people.id, p.id));
  return { ok: true, message: `${p.name} strength → ${s}` };
}

export async function setBackground(name: string, bg: string): Promise<ToolResult> {
  if (!isBg(bg)) return { ok: false, message: `unknown bucket: ${bg}` };
  const p = await ensurePerson(name, bg);
  await db
    .update(schema.people)
    .set({ bg, updatedAt: Date.now() })
    .where(eq(schema.people.id, p.id));
  return { ok: true, message: `${p.name} → ${bg}` };
}

export async function renameCluster(bg: string, name: string): Promise<ToolResult> {
  if (!isBg(bg)) return { ok: false, message: `unknown bucket: ${bg}` };
  const clean = name.trim();
  if (!clean) return { ok: false, message: 'empty name' };
  const existing = await db.query.bucketNames.findFirst({
    where: eq(schema.bucketNames.bg, bg),
  });
  if (existing) {
    await db
      .update(schema.bucketNames)
      .set({ name: clean })
      .where(eq(schema.bucketNames.bg, bg));
  } else {
    await db.insert(schema.bucketNames).values({ bg, name: clean });
  }
  return { ok: true, message: `${bg} renamed → "${clean}"` };
}

export async function deletePerson(name: string): Promise<ToolResult> {
  const p = await findPerson(name);
  if (!p) return { ok: false, message: 'person not found' };
  await db.delete(schema.people).where(eq(schema.people.id, p.id));
  return { ok: true, message: `deleted ${p.name}` };
}

export async function pinToMe(name: string): Promise<ToolResult> {
  const p = await findPerson(name);
  if (!p) return { ok: false, message: 'person not found' };
  await db
    .update(schema.people)
    .set({ pinToMe: true, updatedAt: Date.now() })
    .where(eq(schema.people.id, p.id));
  return { ok: true, message: `${p.name} pinned as a direct connection` };
}

export async function unpinFromMe(name: string): Promise<ToolResult> {
  const p = await findPerson(name);
  if (!p) return { ok: false, message: 'person not found' };
  await db
    .update(schema.people)
    .set({ pinToMe: false, updatedAt: Date.now() })
    .where(eq(schema.people.id, p.id));
  return { ok: true, message: `${p.name} unpinned` };
}

export async function disconnectCluster(bg: string): Promise<ToolResult> {
  if (!isBg(bg)) return { ok: false, message: `unknown bucket: ${bg}` };
  const members = await db.query.people.findMany({
    where: eq(schema.people.bg, bg),
  });
  if (members.length < 2) return { ok: false, message: `nothing to disconnect in ${bg}` };
  let cleared = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const [a, b] = orderedIds(members[i].id, members[j].id);
      const existing = await db.query.edgeOverrides.findFirst({
        where: and(eq(schema.edgeOverrides.aId, a), eq(schema.edgeOverrides.bId, b)),
      });
      if (existing) {
        await db.delete(schema.edgeOverrides).where(eq(schema.edgeOverrides.id, existing.id));
        cleared++;
      }
    }
  }
  return { ok: true, message: `cleared ${cleared} edges in ${bg}` };
}

export async function connectCluster(
  bg: string,
  weight = 5
): Promise<ToolResult> {
  if (!isBg(bg)) return { ok: false, message: `unknown bucket: ${bg}` };
  const members = await db.query.people.findMany({
    where: eq(schema.people.bg, bg),
  });
  if (members.length < 2) {
    return { ok: false, message: `not enough people in ${bg} to interconnect` };
  }
  const w = Math.max(0, Math.min(10, weight));
  let pairs = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      await upsertEdge(members[i].id, members[j].id, { weight: w, deleted: false });
      pairs++;
    }
  }
  return {
    ok: true,
    message: `interconnected ${members.length} people in ${bg} (${pairs} edges @ ${w})`,
  };
}

export type GraphSnapshot = {
  clusters: Array<{
    bg: string;
    name: string | null;
    people: Array<{ name: string; strength: number; tags: string[]; pinned: boolean }>;
  }>;
  totalPeople: number;
};

export async function getGraphSnapshot(): Promise<GraphSnapshot> {
  const allPeople = await db.query.people.findMany();
  const allBuckets = await db.query.bucketNames.findMany();
  const nameByBg = new Map(allBuckets.map((b) => [b.bg, b.name]));
  const byBg = new Map<string, typeof allPeople>();
  for (const p of allPeople) {
    const arr = byBg.get(p.bg) ?? [];
    arr.push(p);
    byBg.set(p.bg, arr);
  }
  const clusters = Array.from(byBg.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([bg, ppl]) => ({
      bg,
      name: nameByBg.get(bg) ?? null,
      people: ppl
        .sort((a, b) => b.strength - a.strength)
        .map((p) => ({
          name: p.name,
          strength: p.strength,
          tags: parseTags(p.tags),
          pinned: !!p.pinToMe,
        })),
    }));
  return { clusters, totalPeople: allPeople.length };
}
