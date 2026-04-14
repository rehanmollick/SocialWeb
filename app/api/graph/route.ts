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
  pinToMe: boolean;
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
  const clusterEdgeRows = await db.query.clusterEdges.findMany();
  const bucketNames: Record<string, string> = {};
  const bucketRopes: Record<string, { weight: number | null; hidden: boolean }> = {};
  for (const r of bucketRows) {
    if (r.name) bucketNames[r.bg] = r.name;
    bucketRopes[r.bg] = { weight: r.meWeight, hidden: !!r.meHidden };
  }

  const nodes: GraphNode[] = allPeople.map((p) => ({
    id: p.id,
    name: p.name,
    bg: p.bg,
    strength: p.strength,
    tags: safeTags(p.tags),
    description: p.description ?? '',
    pinToMe: !!p.pinToMe,
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

  const overrideMap = new Map<string, { weight: number | null; deleted: boolean }>();
  for (const o of overrides) {
    overrideMap.set(pairKey(o.aId, o.bId), { weight: o.weight, deleted: o.deleted });
  }

  // edges = explicit overrides + journal-mention co-occurrences only.
  // bucket co-membership no longer creates edges — the cluster haze IS the implicit signal.
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

  const clusterEdges = clusterEdgeRows.map((r) => ({ a: r.bgA, b: r.bgB, weight: r.weight }));

  return NextResponse.json({ nodes, edges, bucketNames, bucketRopes, clusterEdges });
}

function safeTags(json: string): string[] {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}
