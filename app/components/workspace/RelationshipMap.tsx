"use client";
import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3";
import {
  colorFor,
  groupName,
  type Graph,
  type Person,
} from "@/lib/graph/types";
import {
  geometricTargets,
  formationFor,
  groupBounds,
  dropTarget,
  clearDropPosition,
  clearGroupOffset,
  type Point,
} from "@/lib/graph/layout";
import {
  circleIcon,
  circleColor,
  closeness,
  closenessLevel,
  JUDGMENTS,
  judgmentMarkers,
} from "@/lib/graph/indicators";
import SpaceBackdrop from "./SpaceBackdrop";
import { placeNames } from "@/lib/graph/labels";
type Props = {
  onLegend: () => void;
  onCreate?: (point: Point & { bg: string }) => void;
  graph: Graph;
  selected: number | null;
  matches: Set<number>;
  filtering: boolean;
  onSelect: (id: number) => void;
  onGroup: (bg: string) => void;
  onMove: (
    id: number,
    x: number,
    y: number,
    bg: string,
    positions: { id: number; x: number; y: number }[],
  ) => Promise<void>;
  onArrange: (
    positions: { id: number; x: number; y: number }[],
  ) => Promise<void>;
  // Named drop zones. Each keeps its own spot on the ring and shows only while
  // nobody is in that group, so filling one never shifts the others.
  zones?: string[];
  // People keep the spot they are in when membership changes, and a newcomer
  // lands where it was dropped, instead of the whole group being re-seated.
  sticky?: boolean;
  // Click a line to remove it.
  onDisconnect?: (a: number, b: number) => void;
  onLooser?: (id: number) => void;
  // Several picked people dropped together; `bg` is the group they all join.
  onMoveMany?: (
    ids: number[],
    bg: string,
    positions: { id: number; x: number; y: number }[],
  ) => Promise<void>;
  // Option-drag from one person to another, or onto You.
  onConnect?: (a: number, b: number) => void;
  onCloser?: (id: number) => void;
  focus: number;
  // Replaces the default drag hint, for views where dropping means something else.
  hint?: string;
};
// Screen-pixel width of the line from you to someone: none until they are
// closer than "know well", then from a hairline up to an unmistakable band.
export function bondWidth(p: Pick<Person, "strength" | "pinToMe">) {
  if (p.strength <= 5) return p.pinToMe && p.strength > 0 ? 1 : 0;
  const t = Math.min(1, (p.strength - 5) / 5);
  return 1 + t * t * 6;
}
type Node = SimulationNodeDatum & {
  id: number;
  tx: number;
  ty: number;
  spacing: number;
};
export default function RelationshipMap({
  onLegend,
  onCreate,
  graph,
  selected,
  matches,
  filtering,
  onSelect,
  onGroup,
  onMove,
  onArrange,
  zones = [],
  sticky = false,
  onDisconnect,
  onLooser,
  onMoveMany,
  onConnect,
  onCloser,
  focus,
  hint,
}: Props) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const svg = useRef<SVGSVGElement>(null);
  const positions = useRef(new Map<number, Point>());
  const targets = useRef(new Map<number, Point>());
  const savedCoordinates = useRef(new Map<number, string>());
  const [settling, setSettling] = useState(false);
  const textMeasure = useRef<CanvasRenderingContext2D | null>(null);
  const textWidths = useRef(new Map<string, number>());
  useEffect(() => {
    textMeasure.current = document.createElement("canvas").getContext("2d");
    redraw((v) => v + 1);
  }, []);
  const simulation = useRef<ReturnType<typeof forceSimulation<Node>> | null>(
    null,
  );
  const [revision, redraw] = useState(0);
  const [camera, setCamera] = useState({ x: 0, y: 0, k: 1 });
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastViewInput = useRef(-Infinity);
  function controlView() {
    lastViewInput.current = performance.now();
    if (fitTimer.current) clearTimeout(fitTimer.current);
  }
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [hover, setHover] = useState<string | null>(null);
  const [labels, setLabels] = useState(true);
  const [hoveredPerson, setHoveredPerson] = useState<number | null>(null);
  const drag = useRef<{
    kind: "node" | "pan" | "group" | "link" | "box";
    id?: number;
    ids?: number[];
    cursor?: Point;
    bg?: string;
    start: Point;
    origin: Point;
    moved: boolean;
    points?: Map<number, Point>;
    bounds: ReturnType<typeof groupBounds>;
  } | null>(null);
  // While a person is being dragged their group's outline ignores them, so it
  // holds still and you can see the moment you cross out of it.
  const carried =
    drag.current?.kind === "node" && drag.current.moved
      ? new Set(drag.current.ids)
      : new Set<number>();
  const dragging = carried.size ? drag.current!.id! : null;
  const centers = groupBounds(graph.nodes, positions.current, carried);
  // Empty groups ring the populated ones. The ring is sized from settled
  // targets, not live positions, so the zones hold still while you drag.
  // The ring only ever grows, so zones never drift inward mid-session.
  const ringSize = useRef(380);
  ringSize.current = Math.max(
    ringSize.current,
    ...[...targets.current.values()].map((p) => Math.hypot(p.x, p.y) + 330),
  );
  const ghostRing = ringSize.current;
  const ghosts = zones
    .map((bg, i) => {
      const angle = (i / zones.length) * Math.PI * 2 - Math.PI / 2;
      return {
        bg,
        x: Math.cos(angle) * ghostRing,
        y: Math.sin(angle) * ghostRing * 0.86,
        r: 92,
        ids: [] as number[],
      };
    })
    .filter((g) => !graph.nodes.some((n) => n.bg === g.bg));
  const [hotLine, setHotLine] = useState<string | null>(null);
  // A clicked line is only selected. Removing it takes a second, deliberate
  // step: the Remove button that appears on it, or the Delete key.
  const [chosenLine, setChosenLine] = useState<string | null>(null);
  const removeLine = (key: string) => {
    setChosenLine(null);
    setHotLine(null);
    if (key.startsWith("me-")) onLooser?.(Number(key.slice(3)));
    else {
      const [a, b] = key.split("~").map(Number);
      onDisconnect?.(a, b);
    }
  };
  const chosenRef = useRef({ chosenLine, removeLine });
  chosenRef.current = { chosenLine, removeLine };
  const removeButton = (x: number, y: number, key: string) => (
    <g
      className="line-remove"
      transform={`translate(${x},${y}) scale(${1 / camera.k})`}
      role="button"
      aria-label="Remove line"
      style={{ cursor: "pointer" }}
      onPointerDown={(ev) => ev.stopPropagation()}
      onClick={() => removeLine(key)}
    >
      <rect
        x={-58}
        y={-15}
        width={116}
        height={30}
        rx={15}
        fill="#2a1418"
        stroke="#ffb4b4"
      />
      <text textAnchor="middle" y={4.5} fontSize={12.5} fill="#ffd9d9">
        × Remove line
      </text>
    </g>
  );
  const lastDrop = useRef<Point | null>(null);
  const ghostsRef = useRef(ghosts);
  ghostsRef.current = ghosts;
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layoutKey = JSON.stringify(
    graph.nodes.map((p) => [p.id, p.name, p.bg, p.x, p.y, p.tags.length]),
  );
  useEffect(() => {
    if (drag.current) return;
    // Only a new or unplaced person needs a full settle. After a drag everyone
    // is already where they should be, so the map must not visibly reshuffle.
    const fresh = graph.nodes.some(
      (p) => p.x === null || p.y === null || !positions.current.has(p.id),
    );
    targets.current = geometricTargets(graph.nodes, positions.current);
    const ns: Node[] = graph.nodes.map((p) => {
      const target = targets.current.get(p.id)!,
        old = positions.current.get(p.id);
      const changed = savedCoordinates.current.get(p.id) !== `${p.x}:${p.y}`;
      // Sticky maps: whoever already has a spot keeps it, and a newcomer
      // appears where it was just dropped.
      const landing = sticky && !old ? lastDrop.current : null;
      const start = landing
        ? {
            x: landing.x + Math.sin(p.id * 2.4) * 14,
            y: landing.y + Math.cos(p.id * 2.4) * 14,
          }
        : changed && p.x !== null && p.y !== null
          ? { x: p.x, y: p.y }
          : (old ??
            (p.x !== null && p.y !== null
              ? { x: p.x, y: p.y }
              : {
                  x: target.x + Math.sin(p.id * 2.4) * 22,
                  y: target.y + Math.cos(p.id * 2.4) * 22,
                }));
      // A person you have placed stays where you put them; formations only
      // seat people who have no saved position yet.
      const placed = p.x !== null && p.y !== null;
      return {
        id: p.id,
        ...start,
        tx: placed ? p.x! : sticky && (old || landing) ? start.x : target.x,
        ty: placed ? p.y! : sticky && (old || landing) ? start.y : target.y,
        spacing: Math.max(
          42,
          Math.min(100, p.name.length * 3.6 + 18),
          p.tags.length * 5 + 22,
        ),
      };
    });
    savedCoordinates.current = new Map(
      graph.nodes.map((p) => [p.id, `${p.x}:${p.y}`]),
    );
    // "You" is a fixed body at the origin so nobody settles on top of it.
    const you: Node = {
      id: 0,
      x: 0,
      y: 0,
      fx: 0,
      fy: 0,
      tx: 0,
      ty: 0,
      spacing: 78,
    };
    const sim = forceSimulation([...ns, you])
      .force("x", forceX<Node>((n) => n.tx).strength(0.055))
      .force("y", forceY<Node>((n) => n.ty).strength(0.055))
      .force("collision", forceCollide<Node>((n) => n.spacing).iterations(3))
      .velocityDecay(0.62)
      .alphaDecay(0.027)
      .alphaMin(0.003);
    // Calm by default: a full settle only for a first layout.
    if (!fresh) sim.alpha(0.08);
    else if (sticky && positions.current.size) sim.alpha(0.2);
    lastDrop.current = null;
    simulation.current = sim;
    setSettling(ns.length > 0);
    const update = () => {
      if (drag.current) return;
      positions.current = new Map(
        ns.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]),
      );
      redraw((v) => v + 1);
    };
    sim.on("tick", update).on("end", () => setSettling(false));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sim.stop();
      sim.tick(240);
      setSettling(false);
    }
    update();
    return () => {
      sim.stop();
    };
  }, [layoutKey]);
  useEffect(() => {
    if (!selected) return;
    const p = positions.current.get(selected);
    const person = svg.current?.querySelector<SVGGElement>(
      `[data-person-id="${selected}"]`,
    );
    if (!p || !person || size.w <= 0 || size.h <= 0) return;
    const bounds = person.getBBox();
    // Reveal the whole selected star and its name, keeping the current view
    // when they already fit. A dock resize also checks the new visible area.
    const left = Math.min(48, size.w / 4),
      right = size.w - left,
      top = Math.min(60, size.h / 4),
      bottom = size.h - Math.min(90, size.h / 4);
    setCamera((c) => {
      const x = size.w / 2 + (p.x - c.x) * c.k,
        y = size.h / 2 + (p.y - c.y) * c.k;
      const reveal = (min: number, max: number, start: number, end: number) =>
        max - min > end - start
          ? (min + max - start - end) / 2
          : min < start
            ? min - start
            : max > end
              ? max - end
              : 0;
      const dx = reveal(
          x + bounds.x * c.k,
          x + (bounds.x + bounds.width) * c.k,
          left,
          right,
        ),
        dy = reveal(
          y + bounds.y * c.k,
          y + (bounds.y + bounds.height) * c.k,
          top,
          bottom,
        );
      return dx || dy ? { ...c, x: c.x + dx / c.k, y: c.y + dy / c.k } : c;
    });
  }, [focus, selected, size]);
  function fit() {
    const bounds = [
      ...ghostsRef.current,
      ...groupBounds(graph.nodes, positions.current),
      ...groupBounds(graph.nodes, targets.current),
    ];
    const pts = [
      ...positions.current.values(),
      { x: 0, y: 0 },
      ...bounds.flatMap((g) => [
        { x: g.x - g.r, y: g.y - g.r },
        { x: g.x + g.r, y: g.y + g.r },
      ]),
    ];
    const xs = pts.map((p) => p.x),
      ys = pts.map((p) => p.y);
    const minX = Math.min(...xs) - 30,
      maxX = Math.max(...xs) + 30,
      minY = Math.min(...ys) - 30,
      maxY = Math.max(...ys) + 30;
    const k = Math.min(
      1.5,
      Math.max(100, size.w - 100) / (maxX - minX),
      Math.max(100, size.h - 150) / (maxY - minY),
    );
    setCamera({
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2 + 15 / k,
      k,
    });
  }
  const didFit = useRef(false);
  const fitSize = useRef("");
  useEffect(() => {
    if (
      performance.now() - lastViewInput.current > 600 &&
      (!didFit.current || fitSize.current !== `${size.w}:${size.h}`) &&
      graph.nodes.length &&
      positions.current.size &&
      size.w > 0
    ) {
      const timer = setTimeout(() => {
        if (drag.current) return;
        fit();
        didFit.current = true;
        fitSize.current = `${size.w}:${size.h}`;
      }, 120);
      fitTimer.current = timer;
      return () => clearTimeout(timer);
    }
  }, [graph.nodes.length, size]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      controlView();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left - size.w / 2,
        py = e.clientY - rect.top - size.h / 2;
      setCamera((c) => {
        const k = Math.min(
          3,
          Math.max(
            0.15,
            c.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0025)),
          ),
        );
        return { x: c.x + px / c.k - px / k, y: c.y + py / c.k - py / k, k };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [size]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        controlView();
        setCamera((c) => ({ ...c, k: Math.min(3, c.k * 1.25) }));
      }
      if (e.key === "-") {
        e.preventDefault();
        controlView();
        setCamera((c) => ({ ...c, k: Math.max(0.15, c.k / 1.25) }));
      }
      if (e.key === "Escape") {
        setPicked(new Set());
        setChosenLine(null);
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        chosenRef.current.chosenLine
      ) {
        e.preventDefault();
        chosenRef.current.removeLine(chosenRef.current.chosenLine);
      }
      if (e.key === "0") {
        e.preventDefault();
        controlView();
        fit();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const world = (e: React.MouseEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - size.w / 2) / camera.k + camera.x,
      y: (e.clientY - r.top - size.h / 2) / camera.k + camera.y,
    };
  };
  function start(
    e: React.PointerEvent,
    base: "node" | "pan" | "group",
    id?: number,
    bg?: string,
  ) {
    if (e.button !== 0) return;
    // Pressing anywhere else on the map lets go of a selected line.
    if (chosenLine) setChosenLine(null);
    // Shift-click adds or removes a person from the picked set.
    if (base === "node" && e.shiftKey) {
      e.stopPropagation();
      setPicked((v) => {
        const next = new Set(v);
        if (!next.delete(id!)) next.add(id!);
        return next;
      });
      return;
    }
    // Option-drag draws a line; shift-drag on empty space draws a selection box.
    const kind =
      base === "node" && e.altKey
        ? "link"
        : base === "pan" && e.shiftKey
          ? "box"
          : base;
    const ids =
      kind !== "node"
        ? []
        : picked.has(id!) && picked.size > 1
          ? [...picked]
          : [id!];
    controlView();
    // A cooling simulation must never overwrite a user's drag with stale coordinates.
    simulation.current?.stop();
    setSettling(false);
    e.stopPropagation();
    svg.current?.setPointerCapture(e.pointerId);
    const point = world(e);
    drag.current = {
      kind,
      id,
      ids,
      bg,
      cursor: point,
      start: point,
      origin: kind === "pan" ? { x: e.clientX, y: e.clientY } : point,
      moved: false,
      // A small group stays an easy target when zoomed out: its drop area is
      // never less than a thumb-sized circle on screen.
      bounds: [
        ...groupBounds(graph.nodes, positions.current, new Set(ids)),
        ...ghostsRef.current,
      ].map((g) => ({ ...g, r: Math.max(g.r, 58 / camera.k) })),
      points: new Map([...positions.current].map(([id, p]) => [id, { ...p }])),
    };
  }
  const frame = useRef(0);
  const labelCache = useRef<ReturnType<typeof placeNames> | null>(null);
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = world(e);
    if (d.kind === "pan") {
      const dx = e.clientX - d.origin.x,
        dy = e.clientY - d.origin.y;
      if (Math.hypot(dx, dy) > 2) d.moved = true;
      setCamera((c) => ({ ...c, x: c.x - dx / c.k, y: c.y - dy / c.k }));
      d.origin = { x: e.clientX, y: e.clientY };
      return;
    }
    const dx = p.x - d.start.x,
      dy = p.y - d.start.y;
    if (Math.hypot(dx, dy) > 4 / camera.k) d.moved = true;
    d.cursor = p;
    const ids =
      d.kind === "link" || d.kind === "box"
        ? []
        : d.kind === "node"
          ? d.ids!
          : graph.nodes.filter((n) => n.bg === d.bg).map((n) => n.id);
    for (const id of ids) {
      const old = d.points!.get(id)!;
      positions.current.set(id, { x: old.x + dx, y: old.y + dy });
    }
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const live = drag.current;
      if (live?.kind === "node") {
        const n = graph.nodes.find((n) => n.id === live.id)!;
        setHover(dropTarget(positions.current.get(n.id)!, live.bounds, n.bg));
      }
      redraw((v) => v + 1);
    });
  }
  function end(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setHover(null);
    if (svg.current?.hasPointerCapture(e.pointerId))
      svg.current.releasePointerCapture(e.pointerId);
    if (!d.moved) {
      if (d.kind === "node") onSelect(d.id!);
      if (d.kind === "group") onGroup(d.bg!);
      if (d.kind === "pan" && picked.size) setPicked(new Set());
      if (simulation.current && simulation.current.alpha() > 0.003) {
        simulation.current.restart();
        setSettling(true);
      }
      return;
    }
    if (
      d.kind === "pan" &&
      simulation.current &&
      simulation.current.alpha() > 0.003
    ) {
      simulation.current.restart();
      setSettling(true);
    }
    if (d.kind === "box") {
      const [x1, x2] = [d.start.x, d.cursor!.x].sort((a, b) => a - b),
        [y1, y2] = [d.start.y, d.cursor!.y].sort((a, b) => a - b);
      setPicked((v) => {
        const next = new Set(v);
        for (const [id, p] of positions.current)
          if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) next.add(id);
        return next;
      });
      redraw((v) => v + 1);
      return;
    }
    if (d.kind === "link") {
      const at = d.cursor!;
      if (Math.hypot(at.x, at.y) <= Math.max(40, 34 / camera.k))
        onCloser?.(d.id!);
      else {
        const reach = Math.max(26, 22 / camera.k);
        const near = [...positions.current]
          .filter(([id]) => id !== d.id)
          .map(([id, p]) => ({ id, far: Math.hypot(p.x - at.x, p.y - at.y) }))
          .sort((a, b) => a.far - b.far)[0];
        if (near && near.far <= reach) onConnect?.(d.id!, near.id);
      }
      redraw((v) => v + 1);
      return;
    }
    if (d.kind === "node") lastDrop.current = positions.current.get(d.id!)!;
    if (d.kind === "node" && d.ids!.length > 1 && onMoveMany) {
      const n = graph.nodes.find((n) => n.id === d.id)!;
      const moving = new Set(d.ids);
      const target = dropTarget(positions.current.get(n.id)!, d.bounds, n.bg);
      const stays = !graph.nodes.some(
        (o) => o.bg === n.bg && !moving.has(o.id),
      );
      redraw((v) => v + 1);
      void onMoveMany(
        d.ids!,
        target ?? (stays ? n.bg : `g-${crypto.randomUUID()}`),
        graph.nodes.map((n) => ({ id: n.id, ...positions.current.get(n.id)! })),
      );
      return;
    }
    if (d.kind === "node") {
      const n = graph.nodes.find((n) => n.id === d.id)!;
      const p = positions.current.get(n.id)!;
      const target = dropTarget(p, d.bounds, n.bg);
      // Outside every outline starts a new group. Someone alone in their group
      // just moves, since leaving would only recreate the same group of one.
      const alone = !graph.nodes.some((o) => o.bg === n.bg && o.id !== n.id);
      const bg = target ?? (alone ? n.bg : `g-${crypto.randomUUID()}`);
      const settled = clearDropPosition(
        p,
        [...positions.current]
          .filter(([id]) => id !== n.id)
          .map(([, point]) => point),
      );
      positions.current.set(n.id, settled);
      redraw((v) => v + 1);
      void onMove(
        n.id,
        settled.x,
        settled.y,
        bg,
        graph.nodes.map((n) => ({ id: n.id, ...positions.current.get(n.id)! })),
      );
    }
    if (d.kind === "group") {
      const members = new Set(
        graph.nodes.filter((n) => n.bg === d.bg).map((n) => n.id),
      );
      const offset = clearGroupOffset(
        [...positions.current]
          .filter(([id]) => members.has(id))
          .map(([, p]) => p),
        [
          { x: 0, y: 0 },
          ...[...positions.current]
            .filter(([id]) => !members.has(id))
            .map(([, p]) => p),
        ],
      );
      for (const id of members) {
        const p = positions.current.get(id)!;
        positions.current.set(id, { x: p.x + offset.x, y: p.y + offset.y });
      }
      redraw((v) => v + 1);
      void onArrange(
        graph.nodes.map((n) => ({ id: n.id, ...positions.current.get(n.id)! })),
      );
    }
  }
  const connected = new Set(
    graph.edges
      .filter((e) => e.source === selected || e.target === selected)
      .flatMap((e) => [e.source, e.target]),
  );
  // Reserve label rectangles in screen space. Priority people retain labels
  // when zoomed out; hovering or selecting always reveals the person's name.
  const nodeRadius = (n: Person) =>
    Math.max(
      3.5,
      (5 + n.strength * 0.65) *
        (n.id === selected ? 1 : Math.min(1, camera.k / 0.8)),
    ) / camera.k;
  const detailScale = Math.max(0.45, Math.min(1, Math.pow(camera.k, 0.55)));
  const traitRadius = (n: Person) =>
    Math.max(
      nodeRadius(n) * camera.k + 11 * detailScale,
      (Math.min(10, n.tags.length) * 12 * detailScale) / 2.25,
    );
  const measureName = (name: string, font: number) => {
    const key = `${font.toFixed(2)}:${name}`;
    let width = textWidths.current.get(key);
    if (width === undefined) {
      const ctx = textMeasure.current;
      if (ctx)
        ctx.font = `500 ${font}px -apple-system, BlinkMacSystemFont, sans-serif`;
      width = ctx?.measureText(name).width ?? name.length * font * 0.56;
      if (textWidths.current.size > 4000) textWidths.current.clear();
      textWidths.current.set(key, width);
    }
    return width;
  };
  const moving = !!drag.current?.moved;
  const nameLabels =
    moving && labelCache.current
      ? labelCache.current
      : placeNames(
          graph.nodes.flatMap((n) => {
            const p = positions.current.get(n.id);
            if (!p) return [];
            return [
              {
                id: n.id,
                x: p.x * camera.k,
                y: p.y * camera.k,
                radius: nodeRadius(n) * camera.k,
                halo: Math.max(
                  nodeRadius(n) * camera.k + 6 * detailScale,
                  n.tags.length ? traitRadius(n) + 6 * detailScale : 0,
                ),
                name: n.name,
                priority:
                  Number(n.id === selected || n.id === hoveredPerson) * 100 +
                  Number(!filtering || matches.has(n.id)) * 20 +
                  Number(n.tags.includes("highsignal")) * 5,
                force: n.id === selected || n.id === hoveredPerson,
              },
            ];
          }),
          camera.k,
          measureName,
          centers.map((g) => {
            const text = `${groupName(g.bg, graph.bucketNames).toUpperCase()} · ${g.ids.length}`;
            const width = measureName(text, 10) + text.length * 1.5 + 6,
              x = g.x * camera.k,
              y = (g.y - g.r - 12) * camera.k;
            return {
              left: x - width / 2,
              right: x + width / 2,
              top: y - 12,
              bottom: y + 4,
            };
          }),
        );
  labelCache.current = nameLabels;
  return (
    <div className="map-stage" data-settling={settling}>
      <SpaceBackdrop />
      <svg
        className="relationship-canvas"
        ref={svg}
        aria-label="Relationship map. Drag people into groups to change their spatial home. Use Tab to focus people and Enter to open their profiles."
        role="group"
        onPointerDown={(e) => start(e, "pan")}
        onDoubleClick={(e) => {
          if (
            onCreate &&
            !(e.target as Element).closest(".map-person, .group-label")
          ) {
            const point = world(e);
            onCreate({
              ...point,
              bg: dropTarget(point, centers, "") ?? `g-${crypto.randomUUID()}`,
            });
          }
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          if (drag.current?.points) positions.current = drag.current.points;
          drag.current = null;
          setHover(null);
          redraw((v) => v + 1);
        }}
      >
        <defs>
          <radialGradient id="signal-aura">
            <stop stopColor="#f4f8ff" stopOpacity=".95" />
            <stop offset=".35" stopColor="#c6dbff" stopOpacity=".65" />
            <stop offset="1" stopColor="#aac7ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="haze">
            <stop offset="0" stopColor="currentColor" stopOpacity=".12" />
            <stop offset=".8" stopColor="currentColor" stopOpacity=".035" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <filter
            id="signal-glow"
            x="-200%"
            y="-200%"
            width="500%"
            height="500%"
          >
            <feGaussianBlur stdDeviation={2.5 / camera.k} />
          </filter>
          <pattern
            id="stars"
            width="113"
            height="97"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="11" cy="32" r=".7" fill="#8592b0" opacity=".28" />
            <circle cx="72" cy="81" r=".5" fill="#b8bfda" opacity=".2" />
          </pattern>
        </defs>
        <g
          transform={`translate(${size.w / 2},${size.h / 2}) scale(${camera.k}) translate(${-camera.x},${-camera.y})`}
        >
          {[180, 360, 540, 720].map((r) => (
            <circle
              key={r}
              r={r}
              fill="none"
              stroke="#aeb9d4"
              strokeOpacity=".045"
              strokeDasharray="2 9"
            />
          ))}
          {centers.map((g) => (
            <g
              key={g.bg}
              data-formation={formationFor(g.bg)}
              style={{ color: colorFor(g.bg) }}
            >
              <circle cx={g.x} cy={g.y} r={g.r + 32} fill="url(#haze)" />
              <circle
                cx={g.x}
                cy={g.y}
                r={g.r}
                fill="transparent"
                stroke="currentColor"
                strokeOpacity={hover === g.bg ? 0.95 : 0.12}
                strokeWidth={(hover === g.bg ? 2 : 1) / camera.k}
                strokeDasharray={hover === g.bg ? "6 4" : "2 8"}
                onPointerDown={(e) => start(e, "group", undefined, g.bg)}
              />
              <text
                x={g.x}
                y={g.y - g.r - 12}
                textAnchor="middle"
                fill="currentColor"
                fontSize={10 / camera.k}
                letterSpacing={1.5 / camera.k}
                className="group-label"
                data-group-label={g.bg}
                onPointerDown={(e) => start(e, "group", undefined, g.bg)}
              >
                {groupName(g.bg, graph.bucketNames).toUpperCase()} ·{" "}
                {g.ids.length}
              </text>
            </g>
          ))}
          {dragging !== null &&
            !hover &&
            graph.nodes.some(
              (o) =>
                !carried.has(o.id) &&
                o.bg === graph.nodes.find((n) => n.id === dragging)?.bg,
            ) &&
            (() => {
              const p = positions.current.get(dragging)!;
              return (
                <g className="new-group-ghost" pointerEvents="none">
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={80}
                    fill="#c6d4f30d"
                    stroke="#c6d4f3"
                    strokeOpacity=".7"
                    strokeWidth={1.2 / camera.k}
                    strokeDasharray={`${5 / camera.k} ${4 / camera.k}`}
                  />
                  <text
                    x={p.x}
                    y={p.y - 80 - 10 / camera.k}
                    textAnchor="middle"
                    fill="#dbe3ff"
                    fontSize={11 / camera.k}
                    letterSpacing={1 / camera.k}
                  >
                    NEW GROUP
                  </text>
                </g>
              );
            })()}
          {ghosts.map((g) => (
            <g
              key={g.bg}
              className="empty-group"
              data-empty-group={g.bg}
              pointerEvents="none"
            >
              <circle
                cx={g.x}
                cy={g.y}
                r={g.r}
                fill={hover === g.bg ? "#c6d4f31a" : "#c6d4f308"}
                stroke="#c6d4f3"
                strokeOpacity={hover === g.bg ? 0.95 : 0.3}
                strokeWidth={(hover === g.bg ? 2 : 1) / camera.k}
                strokeDasharray={`${4 / camera.k} ${6 / camera.k}`}
              />
              <text
                x={g.x}
                y={g.y + 4 / camera.k}
                textAnchor="middle"
                fill="#c6d4f3"
                fillOpacity={hover === g.bg ? 1 : 0.62}
                fontSize={Math.min(36, 12.5 / camera.k)}
                letterSpacing={0.6 / camera.k}
              >
                {groupName(g.bg, graph.bucketNames)}
              </text>
            </g>
          ))}
          {graph.clusterEdges.map((e, i) => {
            const a = centers.find((g) => g.bg === e.a),
              b = centers.find((g) => g.bg === e.b);
            return a && b ? (
              <line
                key={`c${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#9dabc4"
                strokeWidth={0.5 + e.weight * 0.2}
                strokeDasharray="8 6"
                strokeOpacity=".25"
              />
            ) : null;
          })}
          {graph.edges.map((e) => {
            const a = positions.current.get(e.source),
              b = positions.current.get(e.target);
            if (!a || !b) return null;
            const active = selected === e.source || selected === e.target;
            const key = `${e.source}~${e.target}`,
              chosen = chosenLine === key,
              hot = hotLine === key || chosen;
            // 1px at the weakest up to a clear 6px band at the strongest.
            const width = (1 + Math.pow(e.weight / 10, 1.6) * 5) / camera.k;
            return (
              <g key={key} className="map-edge" data-edge={key}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={
                    chosen ? "#ffb4b4" : hot || active ? "#e3ecfa" : "#9fb0cc"
                  }
                  strokeLinecap="round"
                  strokeWidth={width}
                  strokeOpacity={
                    hot || active
                      ? 0.85
                      : filtering &&
                          (!matches.has(e.source) || !matches.has(e.target))
                        ? 0.05
                        : 0.38
                  }
                  pointerEvents="none"
                />
                {onDisconnect && (
                  <line
                    className="line-hit"
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="transparent"
                    strokeWidth={14 / camera.k}
                    style={{ cursor: "pointer" }}
                    onPointerEnter={() => setHotLine(key)}
                    onPointerLeave={() => setHotLine(null)}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={() => setChosenLine(chosen ? null : key)}
                  >
                    <title>Click to select this line</title>
                  </line>
                )}
                {chosen && removeButton((a.x + b.x) / 2, (a.y + b.y) / 2, key)}
              </g>
            );
          })}
          {/* A line to you means you are close; it thickens with closeness. */}
          {graph.nodes
            .filter((n) => bondWidth(n) > 0)
            .map((n) => {
              const p = positions.current.get(n.id);
              return p ? (
                <line
                  key={`me-${n.id}`}
                  className="map-bond"
                  data-bond={n.id}
                  x1={0}
                  y1={0}
                  x2={p.x}
                  y2={p.y}
                  stroke={
                    chosenLine === `me-${n.id}` ? "#ffb4b4" : colorFor(n.bg)
                  }
                  strokeLinecap="round"
                  strokeWidth={
                    Math.max(
                      bondWidth(n),
                      chosenLine === `me-${n.id}` ? 3 : 0,
                    ) / camera.k
                  }
                  strokeOpacity={
                    hotLine === `me-${n.id}` || chosenLine === `me-${n.id}`
                      ? 0.9
                      : filtering && !matches.has(n.id)
                        ? 0.06
                        : n.id === selected
                          ? 0.85
                          : 0.42
                  }
                  style={onLooser ? { cursor: "pointer" } : undefined}
                  pointerEvents={onLooser ? "stroke" : "none"}
                  onPointerEnter={() => setHotLine(`me-${n.id}`)}
                  onPointerLeave={() => setHotLine(null)}
                  onPointerDown={(ev) => onLooser && ev.stopPropagation()}
                  onClick={() =>
                    onLooser &&
                    setChosenLine((v) =>
                      v === `me-${n.id}` ? null : `me-${n.id}`,
                    )
                  }
                >
                  {onLooser && <title>Click to select this line</title>}
                </line>
              ) : null;
            })}
          {chosenLine?.startsWith("me-") &&
            (() => {
              const p = positions.current.get(Number(chosenLine.slice(3)));
              return p ? removeButton(p.x / 2, p.y / 2, chosenLine) : null;
            })()}
          <g
            className="map-you"
            transform={`scale(${Math.min(3.2, Math.max(1, 1.15 / camera.k))})`}
            pointerEvents="none"
          >
            <circle r="21" fill="#141c2b" stroke="#8fa3c4" strokeWidth="1" />
            <circle r="29" fill="none" stroke="#6f7f9c" strokeOpacity=".4" />
            <text
              textAnchor="middle"
              y="4"
              fill="#eef3fb"
              fontSize="10"
              fontWeight="600"
              letterSpacing="1.5"
            >
              YOU
            </text>
          </g>
          {graph.nodes.map((n) => {
            const p = positions.current.get(n.id);
            if (!p) return null;
            const signal = n.tags.includes("highsignal"),
              agency = n.tags.includes("highagency");
            const active = n.id === selected;
            const dim = filtering && !matches.has(n.id);
            const r = nodeRadius(n);
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                opacity={dim ? 0.13 : 1}
                className="map-person"
                data-person-id={n.id}
                role="button"
                tabIndex={dim ? -1 : 0}
                aria-label={`${n.name} · ${closeness(n)}${signal ? " · High signal" : ""}${agency ? " · High agency" : ""}${n.circles.length ? " · " + n.circles.join(", ") : ""}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(n.id);
                  }
                }}
                onPointerEnter={() => setHoveredPerson(n.id)}
                onPointerLeave={() => setHoveredPerson(null)}
                onPointerDown={(e) => start(e, "node", n.id)}
              >
                <title>
                  {n.name}
                  {signal ? " · High signal" : ""}
                  {agency ? " · High agency" : ""}
                  {` · Closeness ${closenessLevel(n)}/5: ${closeness(n)} · ${groupName(n.bg, graph.bucketNames)} · ${n.circles.join(", ")} · ${JUDGMENTS.filter(
                    ([tag]) => n.tags.includes(tag),
                  )
                    .map(([, , label]) => label)
                    .join(", ")}`}
                </title>
                {signal && (
                  <g className="high-signal-aura" pointerEvents="none">
                    <circle
                      r={r + (20 * detailScale) / camera.k}
                      fill="url(#signal-aura)"
                    />
                    <circle
                      r={r + (5 * detailScale) / camera.k}
                      fill="#edf5ff"
                      filter="url(#signal-glow)"
                      opacity=".8"
                    />
                  </g>
                )}
                {(active || connected.has(n.id)) && (
                  <circle
                    r={r + 8}
                    fill="none"
                    stroke={active ? "#f2f5ff" : "#8796ad"}
                    strokeWidth="1"
                  />
                )}
                {/* Grab area stays finger-sized on screen at any zoom. */}
                <circle r={Math.max(22, 20 / camera.k)} fill="transparent" />
                {picked.has(n.id) && (
                  <circle
                    className="picked-ring"
                    r={r + 9 / camera.k}
                    fill="#c6d4f31f"
                    stroke="#e8eeff"
                    strokeWidth={1.4 / camera.k}
                    strokeDasharray={`${3 / camera.k} ${3 / camera.k}`}
                  />
                )}
                <circle
                  r={r + 5 / camera.k}
                  fill="none"
                  stroke={colorFor(n.bg)}
                  strokeOpacity=".18"
                  strokeWidth={2 / camera.k}
                />
                {n.circles.map((circle, i) => (
                  <circle
                    className="map-category-segment"
                    data-circle={circle}
                    key={circle}
                    r={r + 5 / camera.k}
                    fill="none"
                    stroke={circleColor(circle)}
                    strokeWidth={2.8 / camera.k}
                    pathLength="100"
                    strokeDasharray={`${Math.max(0.3, 100 / n.circles.length - 2)} 100`}
                    transform={`rotate(${-90 + (i * 360) / n.circles.length})`}
                  >
                    <title>{circle}</title>
                  </circle>
                ))}
                <circle
                  r={r}
                  className="map-star"
                  fill={colorFor(n.bg)}
                  stroke={agency ? "#efcb88" : "#18212e"}
                  strokeWidth={agency ? 2.5 : 1}
                />
                {judgmentMarkers(n.tags).map((trait, i) => {
                  const ring = Math.floor(i / 10),
                    count = Math.min(10, n.tags.length - ring * 10),
                    slot = i % 10;
                  const angle =
                    ((-160 + (count === 1 ? 115 : (slot * 140) / (count - 1))) *
                      Math.PI) /
                    180;
                  const radius =
                    (traitRadius(n) + ring * 16 * detailScale) / camera.k;
                  return (
                    <g
                      className="judgment-marker"
                      data-trait={trait.tag}
                      key={trait.tag}
                      transform={`translate(${Math.cos(angle) * radius},${Math.sin(angle) * radius})`}
                    >
                      <title>{trait.label}</title>
                      <circle
                        r={(7 * detailScale) / camera.k}
                        fill="#10192ae6"
                        stroke={
                          trait.tag === "highagency" ? "#d4b472" : "#a8bfd6"
                        }
                        strokeOpacity=".32"
                        strokeWidth={0.7 / camera.k}
                      />
                      <text
                        textAnchor="middle"
                        y={(4 * detailScale) / camera.k}
                        fontSize={
                          ((trait.tag === "highagency" ? 19 : 12) *
                            detailScale) /
                          camera.k
                        }
                        fontWeight="600"
                        fill={
                          trait.tag === "highagency"
                            ? "#ffdc8d"
                            : trait.tag === "highsignal"
                              ? "#fff5dc"
                              : "#d6ddf3"
                        }
                        paintOrder="stroke"
                        stroke="#0a101d"
                        strokeWidth={1.5 / camera.k}
                      >
                        {trait.icon}
                      </text>
                    </g>
                  );
                })}
                <g
                  className="map-closeness"
                  transform={`translate(${r + 3 / camera.k},${r - 1 / camera.k}) scale(${Math.max(0.65, detailScale)})`}
                >
                  <title>
                    {closeness(n)} · {closenessLevel(n)} of 5
                  </title>
                  <rect
                    x={0}
                    y={0}
                    width={14 / camera.k}
                    height={14 / camera.k}
                    rx={4 / camera.k}
                    fill="#111a2d"
                    stroke={colorFor(n.bg)}
                    strokeOpacity=".75"
                    strokeWidth={0.7 / camera.k}
                  />
                  <text
                    x={7 / camera.k}
                    y={10.5 / camera.k}
                    textAnchor="middle"
                    fill="#f0f4ff"
                    fontSize={10 / camera.k}
                    fontWeight="600"
                  >
                    {closenessLevel(n)}
                  </text>
                </g>
                {(active || hoveredPerson === n.id) &&
                  n.circles.length <= 8 &&
                  n.circles.map((c, i) => {
                    const angle =
                      Math.PI + (i - (n.circles.length - 1) / 2) * 0.42;
                    const distance = r + 19 / camera.k;
                    return (
                      <text
                        className="category-icon"
                        key={c}
                        x={Math.cos(angle) * distance}
                        y={Math.sin(angle) * distance + 4 / camera.k}
                        textAnchor="middle"
                        fill={circleColor(c)}
                        fontSize={12 / camera.k}
                        stroke="#090c15"
                        strokeWidth={2 / camera.k}
                        paintOrder="stroke"
                      >
                        <title>{c}</title>
                        {circleIcon(c)}
                      </text>
                    );
                  })}
                {labels &&
                  nameLabels.has(n.id) &&
                  (nameLabels.get(n.id)!.anchor !== "middle" ||
                    nameLabels.get(n.id)!.dy < 0 ||
                    nameLabels.get(n.id)!.dy > r * camera.k + 32) && (
                    <line
                      x1={0}
                      y1={nameLabels.get(n.id)!.dy < 0 ? -r : r}
                      x2={nameLabels.get(n.id)!.dx / camera.k}
                      y2={
                        (nameLabels.get(n.id)!.dy -
                          nameLabels.get(n.id)!.font / 2) /
                        camera.k
                      }
                      stroke="#94a4c0"
                      strokeOpacity=".3"
                      strokeWidth={0.5 / camera.k}
                      pointerEvents="none"
                    />
                  )}
                {((labels && nameLabels.has(n.id)) ||
                  active ||
                  hoveredPerson === n.id) &&
                  nameLabels.has(n.id) && (
                    <text
                      className="person-name"
                      x={nameLabels.get(n.id)!.dx / camera.k}
                      y={nameLabels.get(n.id)!.dy / camera.k}
                      textAnchor={nameLabels.get(n.id)!.anchor}
                      fill={active ? "#fff" : "#bec7d7"}
                      fontSize={nameLabels.get(n.id)!.font / camera.k}
                      fontWeight={signal ? 600 : 400}
                      paintOrder="stroke"
                      stroke="#0b1018"
                      strokeWidth={Math.max(1.5, 2.5 * detailScale) / camera.k}
                    >
                      {n.name}
                    </text>
                  )}
              </g>
            );
          })}
          {drag.current?.kind === "link" &&
            drag.current.moved &&
            (() => {
              const from = positions.current.get(drag.current.id!)!,
                to = drag.current.cursor!;
              return (
                <line
                  className="link-preview"
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#e8eeff"
                  strokeWidth={2 / camera.k}
                  strokeDasharray={`${6 / camera.k} ${4 / camera.k}`}
                  pointerEvents="none"
                />
              );
            })()}
          {drag.current?.kind === "box" &&
            drag.current.moved &&
            (() => {
              const a = drag.current.start,
                b = drag.current.cursor!;
              return (
                <rect
                  className="pick-box"
                  x={Math.min(a.x, b.x)}
                  y={Math.min(a.y, b.y)}
                  width={Math.abs(a.x - b.x)}
                  height={Math.abs(a.y - b.y)}
                  fill="#c6d4f314"
                  stroke="#c6d4f3"
                  strokeWidth={1 / camera.k}
                  strokeDasharray={`${4 / camera.k} ${3 / camera.k}`}
                  pointerEvents="none"
                />
              );
            })()}
        </g>
      </svg>
      {picked.size > 0 && (
        <div className="picked-bar" role="status">
          {picked.size} picked · drag one to move them all
          <button onClick={() => setPicked(new Set())}>Clear</button>
        </div>
      )}
      <div className="map-legend">
        <button onClick={onLegend}>ⓘ Map key</button>
        <span>Color = group · ring = circles · line to you = how close</span>
      </div>
      <div className="map-controls">
        <button onClick={() => setLabels((v) => !v)} aria-pressed={labels}>
          Names
        </button>
        <button
          onClick={() => {
            controlView();
            setCamera((c) => ({ ...c, k: Math.max(0.15, c.k / 1.25) }));
          }}
          aria-label="Zoom out"
        >
          −
        </button>
        <input
          type="range"
          className="zoom-slider"
          aria-label="Map zoom"
          min="15"
          max="300"
          step="1"
          value={Math.round(camera.k * 100)}
          onChange={(e) => {
            controlView();
            setCamera((c) => ({ ...c, k: Number(e.target.value) / 100 }));
          }}
        />
        <output aria-label="Zoom level">{Math.round(camera.k * 100)}%</output>
        <button
          onClick={() => {
            controlView();
            setCamera((c) => ({ ...c, k: Math.min(3, c.k * 1.25) }));
          }}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => {
            controlView();
            fit();
          }}
        >
          Fit map
        </button>
      </div>
      {size.w >= 1000 && (
        <div className="map-instructions">
          {hint ??
            `${settling ? "Constellations settling" : "Drag to arrange"} · Drop into a group to join · Double-click space to add`}
        </div>
      )}
    </div>
  );
}
