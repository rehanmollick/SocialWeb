import type { Graph, Memory, Person } from "./types";
type Universe = { graph: Graph; memories: Memory[] };
const KEY = "socialweb-demo-v1";
let current: Universe | null = null;
let history: Universe[] = [];
export function freshDemo(): Universe {
  const groups = [
    "The inner orbit",
    "Creator crew",
    "Builders",
    "After hours",
    "New connections",
  ];
  const names = [
    "Maya Chen",
    "Leo Brooks",
    "Zara Ali",
    "Noah Park",
    "Iris Bell",
    "Theo West",
    "Luna Rivera",
    "Arlo James",
    "Nina Patel",
    "Jules Reed",
    "Kai Morgan",
    "Ada Lin",
    "Omar Blake",
    "Sofia Hart",
    "Eli Stone",
    "Cleo Rivers",
    "Finn Cole",
    "Ruby King",
    "Remy Scott",
    "Ari Lane",
    "Milo Gray",
    "Esme Fox",
    "Sam Cruz",
    "Bea Young",
    "Alex Dawn",
  ];
  const notes = [
    "A close friend who always gives honest life advice.",
    "Shoots UGC and short-form content; loves collaborating.",
    "Building a startup; thoughtful about product and hiring.",
    "Knows the local music scene and brings people together.",
    "Met at a design meetup. Curious about freelance work.",
  ];
  const circles = [
    ["Close friends", "Life advice"],
    ["Content", "UGC"],
    ["Startups", "Career"],
    ["Going out", "Introductions"],
    ["Freelance", "Content"],
  ];
  const nodes: Person[] = names.map((name, i) => {
    const g = Math.floor(i / 5);
    return {
      id: i + 1,
      name,
      bg: `demo-${g}`,
      description: notes[g],
      circles: [
        ...new Set(i % 3 === 0 ? [...circles[g], "Close friends"] : circles[g]),
      ],
      tags: [
        ...(i % 4 === 0 ? ["highsignal"] : []),
        ...(i % 3 === 0 ? ["highagency"] : []),
      ],
      strength: Math.max(1, 10 - g * 2 - (i % 2)),
      pinToMe: false,
      lastContact: "",
      followUp: "",
      nextStep: "",
      x: null,
      y: null,
    };
  });
  return {
    graph: {
      nodes,
      edges: nodes
        .filter((_, i) => i % 5 !== 4)
        .map((p) => ({
          source: p.id,
          target: p.id + 1,
          weight: 3 + (p.id % 6),
        }))
        .concat([
          { source: 2, target: 8, weight: 6 },
          { source: 9, target: 13, weight: 4 },
          { source: 4, target: 17, weight: 7 },
        ]),
      bucketNames: Object.fromEntries(groups.map((g, i) => [`demo-${i}`, g])),
      clusterEdges: [],
    },
    memories: [
      {
        id: 1,
        body: "Maya introduced me to Luna at a creator dinner. Luna is looking for someone to help with a UGC shoot.",
        personIds: [1, 7],
        mentions: ["Maya Chen", "Luna Rivera"],
        createdAt: "2026-09-20T18:00:00Z",
      },
    ],
  };
}
function read() {
  if (!current) {
    try {
      current = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {}
    current ??= freshDemo();
  }
  return current;
}
function save(next: Universe) {
  localStorage.setItem(KEY, JSON.stringify(next));
  current = next;
}
export function resetDemo() {
  save(freshDemo());
  history = [];
}
// An isolated browser store: demo mutations never reach the personal API/database.
export async function demoRequest(
  path: string,
  method = "GET",
  body: Record<string, unknown> = {},
): Promise<any> {
  const state = read();
  if (method === "GET") {
    if (path === "graph") return structuredClone(state.graph);
    if (path === "memories")
      return { thoughts: structuredClone(state.memories) };
    if (path === "history")
      return { entries: history.length ? [{ label: "Demo change" }] : [] };
    if (path === "status") return { ai: false };
  }
  if (path === "history") {
    const previous = history.at(-1);
    if (previous) {
      save(previous);
      history.pop();
    }
    return { ok: true };
  }
  const next = structuredClone(state),
    g = next.graph;
  let result: Record<string, unknown> = { ok: true };
  const resolveGroup = (data: Record<string, unknown>) => {
    if (typeof data.bg === "string" && data.bg.startsWith("group:")) {
      const name = data.bg.slice(6).trim();
      const bg =
        Object.keys(g.bucketNames).find(
          (k) => g.bucketNames[k].toLowerCase() === name.toLowerCase(),
        ) ?? `g-${crypto.randomUUID()}`;
      g.bucketNames[bg] = name;
      data.bg = bg;
    }
  };
  const add = (data: Record<string, unknown>) => {
    const name = String(data.name ?? "").trim();
    if (!name) throw Error("Name is required.");
    if (g.nodes.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      throw Error(`${name} already exists.`);
    resolveGroup(data);
    const id = Math.max(0, ...g.nodes.map((p) => p.id)) + 1;
    g.nodes.push({
      id,
      name,
      bg: "online",
      strength: 3,
      tags: [],
      circles: [],
      description: "",
      pinToMe: false,
      lastContact: "",
      followUp: "",
      nextStep: "",
      x: null,
      y: null,
      ...data,
    } as Person);
    return id;
  };
  if (path === "people") result.id = add({ ...body });
  else if (path === "people/batch")
    result.ids = (body.people as Record<string, unknown>[]).map((p) =>
      add({ ...p }),
    );
  else if (path === "people/positions")
    for (const p of body.positions as { id: number; x: number; y: number }[])
      Object.assign(
        g.nodes.find((n) => n.id === p.id)!,
        p,
      );
  else if (path.startsWith("people/")) {
    const id = Number(path.split("/")[1]);
    if (method === "DELETE") {
      g.nodes = g.nodes.filter((p) => p.id !== id);
      g.edges = g.edges.filter((e) => e.source !== id && e.target !== id);
      next.memories.forEach((m) => {
        m.personIds = m.personIds.filter((p) => p !== id);
      });
    } else {
      const p = g.nodes.find((p) => p.id === id);
      if (!p) throw Error("Person not found.");
      resolveGroup(body);
      if (body.bg && body.bg !== p.bg && !("x" in body)) {
        p.x = null;
        p.y = null;
      }
      Object.assign(p, body);
    }
  } else if (path === "edges") {
    const a = Number(body.a),
      b = Number(body.b);
    g.edges = g.edges.filter(
      (e) =>
        !(
          (e.source === a && e.target === b) ||
          (e.source === b && e.target === a)
        ),
    );
    if (method !== "DELETE")
      g.edges.push({ source: a, target: b, weight: Number(body.weight) });
  } else if (path.startsWith("buckets/")) {
    const bg = decodeURIComponent(path.slice(8));
    if (method === "DELETE") {
      delete g.bucketNames[bg];
      g.nodes
        .filter((p) => p.bg === bg)
        .forEach((p) => {
          p.bg = "online";
          p.x = p.y = null;
        });
      g.clusterEdges = g.clusterEdges.filter((e) => e.a !== bg && e.b !== bg);
    } else g.bucketNames[bg] = String(body.name);
  } else if (path === "cluster-edges") {
    g.clusterEdges = g.clusterEdges.filter(
      (e) =>
        !(
          (e.a === body.bgA && e.b === body.bgB) ||
          (e.b === body.bgA && e.a === body.bgB)
        ),
    );
    if (method !== "DELETE")
      g.clusterEdges.push({
        a: String(body.bgA),
        b: String(body.bgB),
        weight: Number(body.weight),
      });
  } else if (path === "memories") {
    const id =
      Number(body.id) || Math.max(0, ...next.memories.map((m) => m.id)) + 1;
    const old = next.memories.find((m) => m.id === id);
    next.memories = next.memories.filter((m) => m.id !== id);
    if (method !== "DELETE")
      next.memories.unshift({
        id,
        body: String(body.body),
        personIds: body.personIds as number[],
        mentions: [],
        createdAt: old?.createdAt ?? new Date().toISOString(),
      });
  } else throw Error("Switch to My people to use personal backups.");
  save(next);
  history.push(structuredClone(state));
  history = history.slice(-25);
  return result;
}
