import { db, ready } from "@/lib/db";
import { stringList } from "@/lib/graph/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  await ready();
  const people = await db.query.people.findMany();
  const buckets = await db.query.bucketNames.findMany();
  const valid = new Set(people.map((p) => p.id));
  const edges = (await db.query.edgeOverrides.findMany())
    .filter(
      (e) =>
        !e.deleted && e.aId !== e.bId && valid.has(e.aId) && valid.has(e.bId),
    )
    .map((e) => ({
      source: e.aId,
      target: e.bId,
      weight: Math.min(10, Math.max(0, e.weight ?? 3)),
    }));
  return Response.json({
    nodes: people.map((p) => ({
      ...p,
      tags: stringList(p.tags),
      circles: stringList(p.circles),
    })),
    edges,
    bucketNames: Object.fromEntries(
      buckets.filter((b) => b.name).map((b) => [b.bg, b.name]),
    ),
    bucketRopes: Object.fromEntries(
      buckets.map((b) => [b.bg, { weight: b.meWeight, hidden: b.meHidden }]),
    ),
    clusterEdges: (await db.query.clusterEdges.findMany()).map((e) => ({
      a: e.bgA,
      b: e.bgB,
      weight: e.weight,
    })),
  });
}
