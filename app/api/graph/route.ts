import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GraphNode = {
  id: number;
  name: string;
  bg: string;
  strength: number;
  tags: string[];
  description: string;
};

type GraphEdge = {
  source: number;
  target: number;
  weight: number;
};

export async function GET() {
  const allPeople = await db.query.people.findMany();
  const allMentions = await db.query.mentions.findMany();
  const overrides = await db.query.edgeOverrides.findMany();
  const bucketRows = await db.query.bucketNames.findMany();
  const bucketNames: Record<string, string> = {};
  for (const r of bucketRows) bucketNames[r.bg] = r.name;

  const nodes: GraphNode[] = allPeople.map((p) => ({
    id: p.id,
    name: p.name,
    bg: p.bg,
    strength: p.strength,
    tags: safeTags(p.tags),
    description: p.description ?? '',
  }));

  const byThought = new Map<number, number[]>();
  for (const m of allMentions) {
    const arr = byThought.get(m.thoughtId) ?? [];
    arr.push(m.personId);
    byThought.set(m.thoughtId, arr);
  }

  const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const weights = new Map<string, number>();
  for (const ids of byThought.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const k = pairKey(ids[i], ids[j]);
        weights.set(k, (weights.get(k) ?? 0) + 1);
      }
    }
  }

  const byBg = new Map<string, number[]>();
  for (const p of allPeople) {
    if (p.bg === 'online') continue;
    const arr = byBg.get(p.bg) ?? [];
    arr.push(p.id);
    byBg.set(p.bg, arr);
  }
  const bgWeights = new Map<string, number>();
  for (const ids of byBg.values()) {
    if (ids.length < 2 || ids.length > 12) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        bgWeights.set(pairKey(ids[i], ids[j]), 1.2);
      }
    }
  }

  const overrideMap = new Map<string, { weight: number | null; deleted: boolean }>();
  for (const o of overrides) {
    overrideMap.set(pairKey(o.aId, o.bId), { weight: o.weight, deleted: o.deleted });
  }

  const edges: GraphEdge[] = [];
  const emitted = new Set<string>();
  for (const [k, w] of weights) {
    const ov = overrideMap.get(k);
    if (ov?.deleted) continue;
    const [a, b] = k.split('-').map(Number);
    edges.push({ source: a, target: b, weight: ov?.weight ?? w });
    emitted.add(k);
  }
  for (const [k, ov] of overrideMap) {
    if (ov.deleted || emitted.has(k)) continue;
    const [a, b] = k.split('-').map(Number);
    edges.push({ source: a, target: b, weight: ov.weight ?? 1 });
    emitted.add(k);
  }
  for (const [k, w] of bgWeights) {
    if (emitted.has(k)) continue;
    const ov = overrideMap.get(k);
    if (ov?.deleted) continue;
    const [a, b] = k.split('-').map(Number);
    edges.push({ source: a, target: b, weight: w });
    emitted.add(k);
  }

  return NextResponse.json({ nodes, edges, bucketNames });
}

function safeTags(json: string): string[] {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}
