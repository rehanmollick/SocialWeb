export type LabelItem = {
  id: number;
  x: number;
  y: number;
  radius: number;
  halo: number;
  name: string;
  priority: number;
  force: boolean;
};
type Rect = { left: number; right: number; top: number; bottom: number };
export type NameLabel = {
  dx: number;
  dy: number;
  font: number;
  anchor: "middle" | "start" | "end";
  rect: Rect;
};
export function nameFont(zoom: number) {
  return Math.max(11, Math.min(12, 12 * Math.pow(zoom, 0.08)));
}
// Pack every name, trying smaller lettering and alternate placements before
// omitting it. Selected/hovered names always remain available.
export function placeNames(
  items: LabelItem[],
  zoom: number,
  measure: (name: string, font: number) => number,
  reserved: Rect[] = [],
): Map<number, NameLabel> {
  const result = new Map<number, NameLabel>();
  const occupied: Rect[] = [
    ...reserved,
    ...items.map((n) => ({
      left: n.x - n.halo,
      right: n.x + n.halo,
      top: n.y - n.halo,
      bottom: n.y + n.radius + 10 * Math.min(1, zoom / 0.65),
    })),
  ];
  const hits = (r: Rect) =>
    occupied.some(
      (o) =>
        r.left < o.right &&
        r.right > o.left &&
        r.top < o.bottom &&
        r.bottom > o.top,
    );
  for (const n of [...items].sort(
    (a, b) => b.priority - a.priority || a.id - b.id,
  )) {
    const base = n.force ? 12 : nameFont(zoom);
    let best: NameLabel | undefined;
    // Screen-space text stays readable even when a dense overview needs to
    // omit some names. A revealed name always keeps its full reading size.
    const fonts = n.force
      ? [base]
      : [...new Set([base, Math.max(10.5, base - 1)])];
    for (const font of fonts) {
      const width = measure(n.name, font) + 4,
        gap = 3,
        below = n.radius + Math.max(8, 15 * Math.min(1, zoom / 0.65));
      const choices: { dx: number; dy: number; anchor: NameLabel["anchor"] }[] =
        [
          { dx: 0, dy: below + font, anchor: "middle" },
          { dx: 0, dy: below + font * 2 + 4, anchor: "middle" },
          { dx: n.halo + gap, dy: font / 3, anchor: "start" },
          { dx: -n.halo - gap, dy: font / 3, anchor: "end" },
          { dx: 0, dy: -n.halo - gap, anchor: "middle" },
          { dx: 0, dy: below + font, anchor: "start" },
          { dx: 0, dy: below + font, anchor: "end" },
          { dx: 0, dy: -n.halo - gap, anchor: "start" },
          { dx: 0, dy: -n.halo - gap, anchor: "end" },
          { dx: n.halo + gap, dy: below + font, anchor: "start" },
          { dx: -n.halo - gap, dy: below + font, anchor: "end" },
          { dx: 0, dy: -n.halo - gap - font - 3, anchor: "middle" },
          { dx: 0, dy: below + font * 3 + 8, anchor: "middle" },
          { dx: 0, dy: -n.halo - gap - font - 3, anchor: "start" },
          { dx: 0, dy: -n.halo - gap - font - 3, anchor: "end" },
        ];
      for (const c of choices) {
        const left =
          n.x +
          c.dx -
          (c.anchor === "middle" ? width / 2 : c.anchor === "end" ? width : 0);
        const rect = {
          left,
          right: left + width,
          top: n.y + c.dy - font,
          bottom: n.y + c.dy + 2,
        };
        if (!hits(rect)) {
          best = { ...c, font, rect };
          break;
        }
      }
      if (best) break;
    }
    if (!best && n.force) {
      const font = base,
        width = measure(n.name, font) + 4,
        dy = n.radius + 20 + font;
      best = {
        dx: 0,
        dy,
        font,
        anchor: "middle",
        rect: {
          left: n.x - width / 2,
          right: n.x + width / 2,
          top: n.y + dy - font,
          bottom: n.y + dy + 2,
        },
      };
    }
    if (best) {
      result.set(n.id, best);
      occupied.push(best.rect);
    }
  }
  return result;
}
