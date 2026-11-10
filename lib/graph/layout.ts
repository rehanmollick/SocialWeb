import type { Person } from "./types";
export type Point = { x: number; y: number };
export type Group = {
  bg: string;
  x: number;
  y: number;
  r: number;
  ids: number[];
};
export const FORMATIONS = ["lattice", "staggered", "hexagon", "orbit"] as const;
function seedFor(value: string) {
  let seed = 0;
  for (const c of value) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  return seed;
}
export function formationFor(bg: string) {
  return FORMATIONS[seedFor(bg) % FORMATIONS.length];
}
// Seeded geometry stays recognisable between edits/reloads, without every group
// having the same silhouette. Recenter after rotation to preserve its home.
export function formationOffsets(people: Person[], bg: string): Point[] {
  const n = people.length;
  if (!n) return [];
  if (n === 1) return [{ x: 0, y: 0 }];
  const seed = seedFor(bg),
    pattern = formationFor(bg);
  const spacing = Math.max(
    150,
    Math.min(270, Math.max(...people.map((p) => p.name.length * 7.5 + 65))),
  );
  const rowGap = Math.max(
    115,
    spacing * 0.78,
    Math.max(...people.map((p) => p.tags.length)) * 7 + 90,
  );
  const points: Point[] = [];
  if (pattern === "orbit") {
    let placed = 0,
      ring = 1;
    while (placed < n) {
      const count = Math.min(n - placed, ring * 8),
        radius = Math.max(
          spacing * ring * 1.1,
          spacing / (2 * Math.sin(Math.PI / Math.max(3, count))),
        );
      for (let i = 0; i < count; i++) {
        const angle = (i * Math.PI * 2) / count + ((seed % 12) * Math.PI) / 24;
        points.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius * 0.8,
        });
      }
      placed += count;
      ring++;
    }
  } else if (pattern === "hexagon") {
    points.push({ x: 0, y: 0 });
    for (let ring = 1; points.length < n; ring++) {
      let q = ring,
        r = 0;
      for (const [dq, dr] of [
        [0, -1],
        [-1, 0],
        [-1, 1],
        [0, 1],
        [1, 0],
        [1, -1],
      ])
        for (let step = 0; step < ring && points.length < n; step++) {
          points.push({ x: spacing * (q + r / 2), y: rowGap * r });
          q += dq;
          r += dr;
        }
    }
  } else {
    const cols = Math.ceil(Math.sqrt(n * (pattern === "lattice" ? 1.3 : 1)));
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols),
        col = i % cols;
      points.push({
        x: (col + (pattern === "staggered" && row % 2 ? 0.5 : 0)) * spacing,
        y: row * rowGap,
      });
    }
  }
  const cx = points.reduce((sum, p) => sum + p.x, 0) / n,
    cy = points.reduce((sum, p) => sum + p.y, 0) / n;
  const angle = (((seed % 41) - 20) * Math.PI) / 180;
  return points.map((p) => ({
    x: (p.x - cx) * Math.cos(angle) - (p.y - cy) * Math.sin(angle),
    y: (p.x - cx) * Math.sin(angle) + (p.y - cy) * Math.cos(angle),
  }));
}
export function geometricTargets(
  people: Person[],
  previous = new Map<number, Point>(),
): Map<number, Point> {
  const groups = [...new Set(people.map((p) => p.bg))].sort();
  const formations = groups.map((bg) => {
    const members = people
      .filter((p) => p.bg === bg)
      .sort((a, b) => a.id - b.id);
    return { bg, members, offsets: formationOffsets(members, bg) };
  });
  const footprint = Math.max(
    100,
    ...formations.map(
      (g) => Math.max(...g.offsets.map((p) => Math.hypot(p.x, p.y))) + 80,
    ),
  );
  const radius = Math.max(
    260,
    groups.length > 1
      ? (footprint + 30) / Math.sin(Math.PI / groups.length)
      : 260,
  );
  const result = new Map<number, Point>();
  formations.forEach((g, gi) => {
    const known = g.members.flatMap((p) =>
      p.x !== null && p.y !== null
        ? [{ x: p.x, y: p.y }]
        : previous.has(p.id)
          ? [previous.get(p.id)!]
          : [],
    );
    const angle = (gi * Math.PI * 2) / Math.max(1, groups.length) - Math.PI / 2;
    const center = known.length
      ? {
          x: known.reduce((sum, p) => sum + p.x, 0) / known.length,
          y: known.reduce((sum, p) => sum + p.y, 0) / known.length,
        }
      : { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    g.members.forEach((p, i) =>
      result.set(p.id, {
        x: center.x + g.offsets[i].x,
        y: center.y + g.offsets[i].y,
      }),
    );
  });
  return result;
}
export function initialLayout(people: Person[]): Map<number, Point> {
  const targets = geometricTargets(people);
  return new Map(
    people.map((p) => [
      p.id,
      { x: p.x ?? targets.get(p.id)!.x, y: p.y ?? targets.get(p.id)!.y },
    ]),
  );
}
export function groupBounds(
  people: Person[],
  positions: Map<number, Point>,
  exclude = new Set<number>(),
): Group[] {
  const groups = [...new Set(people.map((p) => p.bg))];
  return groups.flatMap((bg) => {
    const members = people.filter(
      (p) => p.bg === bg && !exclude.has(p.id) && positions.has(p.id),
    );
    if (!members.length) return [];
    const pts = members.map((p) => positions.get(p.id)!);
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return [
      {
        bg,
        x,
        y,
        r: Math.max(80, ...pts.map((p) => Math.hypot(p.x - x, p.y - y) + 48)),
        ids: members.map((p) => p.id),
      },
    ];
  });
}
export function dropTarget(
  point: Point,
  groups: Group[],
  ownBg: string,
): string | null {
  const hits = groups.filter(
    (g) => Math.hypot(point.x - g.x, point.y - g.y) <= g.r,
  );
  hits.sort(
    (a, b) =>
      Math.hypot(point.x - a.x, point.y - a.y) / a.r -
      Math.hypot(point.x - b.x, point.y - b.y) / b.r,
  );
  return hits[0]?.bg ?? null;
}

export function clearDropPosition(point: Point, occupied: Point[]): Point {
  const free = (candidate: Point) =>
    occupied.every(
      (p) => Math.hypot(candidate.x - p.x, candidate.y - p.y) >= 44,
    );
  if (free(point)) return point;
  for (let i = 1; i <= 150; i++) {
    const angle = i * 2.39996323,
      radius = 10 * Math.sqrt(i);
    const candidate = {
      x: point.x + Math.cos(angle) * radius,
      y: point.y + Math.sin(angle) * radius,
    };
    if (free(candidate)) return candidate;
  }
  return { x: Math.max(...occupied.map((p) => p.x)) + 44, y: point.y };
}

// Preserve the constellation's internal geometry when a drop is crowded.
export function clearGroupOffset(moving: Point[], occupied: Point[]): Point {
  for (let i = 0; i <= 600; i++) {
    const angle = i * 2.39996323,
      radius = 10 * Math.sqrt(i);
    const offset = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    if (
      moving.every((a) =>
        occupied.every(
          (b) => Math.hypot(a.x + offset.x - b.x, a.y + offset.y - b.y) >= 44,
        ),
      )
    )
      return offset;
  }
  return {
    x:
      Math.max(...occupied.map((p) => p.x)) +
      44 -
      Math.min(...moving.map((p) => p.x)),
    y: 0,
  };
}
