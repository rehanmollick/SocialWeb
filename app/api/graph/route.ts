import { db } from "@/lib/db";
import { stringList } from "@/lib/graph/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const people = db.query.people.findMany().sync();
  const buckets = db.query.bucketNames.findMany().sync();
  const valid = new Set(people.map((p) => p.id));
  const edges = db.query.edgeOverrides
    .findMany()
    .sync()
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
    clusterEdges: db.query.clusterEdges
      .findMany()
      .sync()
      .map((e) => ({ a: e.bgA, b: e.bgB, weight: e.weight })),
  });
}
