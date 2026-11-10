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
  focus,
  hint,
}: Props) {
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
    kind: "node" | "pan" | "group";
    id?: number;
    bg?: string;
    start: Point;
    origin: Point;
    moved: boolean;
    points?: Map<number, Point>;
    bounds: ReturnType<typeof groupBounds>;
  } | null>(null);
  const centers = groupBounds(graph.nodes, positions.current);
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
    targets.current = geometricTargets(graph.nodes, positions.current);
    const ns: Node[] = graph.nodes.map((p) => {
      const target = targets.current.get(p.id)!,
        old = positions.current.get(p.id);
      const changed = savedCoordinates.current.get(p.id) !== `${p.x}:${p.y}`;
      const start =
        changed && p.x !== null && p.y !== null
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
        tx: placed ? p.x! : target.x,
        ty: placed ? p.y! : target.y,
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
    kind: "node" | "pan" | "group",
    id?: number,
    bg?: string,
  ) {
    if (e.button !== 0) return;
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
      bg,
      start: point,
      origin: kind === "pan" ? { x: e.clientX, y: e.clientY } : point,
      moved: false,
      bounds: groupBounds(
        graph.nodes,
        positions.current,
        new Set(id ? [id] : []),
      ),
      points: new Map([...positions.current].map(([id, p]) => [id, { ...p }])),
    };
  }
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
    const ids =
      d.kind === "node"
        ? [d.id!]
        : graph.nodes.filter((n) => n.bg === d.bg).map((n) => n.id);
    for (const id of ids) {
      const old = d.points!.get(id)!;
      positions.current.set(id, { x: old.x + dx, y: old.y + dy });
    }
    if (d.kind === "node") {
      const n = graph.nodes.find((n) => n.id === d.id)!;
      setHover(dropTarget(positions.current.get(n.id)!, d.bounds, n.bg));
    }
    redraw((v) => v + 1);
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
    if (d.kind === "node") {
      const n = graph.nodes.find((n) => n.id === d.id)!;
      const p = positions.current.get(n.id)!;
      const originalGroup = groupBounds(graph.nodes, d.points!).find(
        (g) => g.bg === n.bg,
      );
      const target = dropTarget(p, d.bounds, n.bg);
      const bg =
        target ??
        (originalGroup &&
        Math.hypot(p.x - originalGroup.x, p.y - originalGroup.y) <=
          originalGroup.r
          ? n.bg
          : `g-${crypto.randomUUID()}`);
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
  const nameLabels = placeNames(
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
                strokeOpacity={hover === g.bg ? 0.5 : 0.12}
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
            return (
              <line
                key={`${e.source}-${e.target}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={active ? "#c6d8ee" : "#8493ad"}
                strokeWidth={0.5 + e.weight * 0.19}
                strokeOpacity={
                  active
                    ? 0.65
                    : filtering &&
                        (!matches.has(e.source) || !matches.has(e.target))
                      ? 0.04
                      : 0.2
                }
              />
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
                  stroke={colorFor(n.bg)}
                  strokeLinecap="round"
                  strokeWidth={bondWidth(n) / camera.k}
                  strokeOpacity={
                    filtering && !matches.has(n.id)
                      ? 0.06
                      : n.id === selected
                        ? 0.85
                        : 0.42
                  }
                  pointerEvents="none"
                />
              ) : null;
            })}
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
                <circle r="22" fill="transparent" />
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
        </g>
      </svg>
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
