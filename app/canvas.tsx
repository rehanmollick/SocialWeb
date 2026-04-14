'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export type GraphNode = {
  id: number;
  name: string;
  bg: string;
  strength: number;
  tags: string[];
  description?: string;
};
export type GraphEdge = { source: number; target: number; weight: number };
export type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bucketNames?: Record<string, string>;
};

type SimNode = GraphNode &
  d3.SimulationNodeDatum & {
    s: number;
    _ax?: number;
    _ay?: number;
    _pinned?: boolean;
    _starPhase?: number;
    _liveBg?: string | null;
    primary?: string;
  };

type SimLink = d3.SimulationLinkDatum<SimNode> & {
  weight: number;
  strength: number;
};

const tagColors: Record<string, string> = {
  highsignal: '#f5d78e',
  highagency: '#ffe98a',
  interesting: '#6ec4b4',
  fun: '#e89999',
  friends: '#8fc08f',
  important: '#d4a659',
  helpful: '#a897c9',
  boring: '#4a4a4a',
};

// preset bucket labels intentionally empty — clusters are unnamed until the user names them.
const bgLabels: Record<string, string> = {};
const bgSubtitle: Record<string, string> = {};
const bgColors: Record<string, string> = {
  plano: '#7a9cb8',
  ut: '#c89060',
  allen: '#78a88c',
  sf: '#b8b8c8',
  family: '#d4a474',
  climb: '#98b478',
  online: '#9c82b8',
};
const bgOrder = ['plano', 'ut', 'allen', 'sf', 'family', 'climb', 'online'] as const;
const CLUSTER_RADIUS = 340;

const bgCenters: Record<string, { x: number; y: number; angle: number }> = {};
bgOrder.forEach((bg, i) => {
  const angle = (i / bgOrder.length) * Math.PI * 2 - Math.PI / 2;
  bgCenters[bg] = {
    x: Math.cos(angle) * CLUSTER_RADIUS,
    y: Math.sin(angle) * CLUSTER_RADIUS,
    angle,
  };
});

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function mixHex(a: string, b: string, t: number): string {
  const ha = a.replace('#', '');
  const hb = b.replace('#', '');
  const ar = parseInt(ha.slice(0, 2), 16);
  const ag = parseInt(ha.slice(2, 4), 16);
  const ab = parseInt(ha.slice(4, 6), 16);
  const br = parseInt(hb.slice(0, 2), 16);
  const bg = parseInt(hb.slice(2, 4), 16);
  const bb = parseInt(hb.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(bl)}`;
}

type Star = {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  phase: number;
  speed: number;
  depth: number;
  tint: string;
  hasCross: boolean;
};
type Nebula = {
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
  drift: number;
  driftY: number;
  pulsePhase: number;
  pulseSpeed: number;
};
type Mote = { x: number; y: number; size: number; alpha: number; vx: number; vy: number };
type Constellation = { points: Star[]; alpha: number; phase: number };
type Orbiter = {
  radius: number;
  theta: number;
  speed: number;
  size: number;
  alpha: number;
  trail: number;
};
type Galaxy = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  alpha: number;
  tint: string;
  spiral: number; // 0 = ellipse, 1 = spiral
  armCount: number;
};
type Planet = {
  x: number;
  y: number;
  radius: number;
  tint: string;
  ring: boolean;
  ringTilt: number;
  ringTint: string;
  glow: number;
};
type BlackHole = {
  x: number;
  y: number;
  radius: number;
  rot: number;
  spinSpeed: number;
};
type MiniGalaxy = {
  x: number;
  y: number;
  size: number;
  rot: number;
  tint: string;
  arms: number;
  tightness: number;
  kind: 'spiral' | 'barred' | 'elliptical';
};
type Comet = {
  orbitCx: number;
  orbitCy: number;
  a: number;
  b: number;
  theta: number;
  speed: number;
  tilt: number;
  tint: string;
};
type Asteroid = {
  x: number;
  y: number;
  size: number;
  rot: number;
  alpha: number;
  shape: number; // pseudo-random seed for jagged silhouette
};
type AsteroidBelt = {
  cx: number;
  cy: number;
  rInner: number;
  rOuter: number;
  rocks: { angle: number; rad: number; size: number; alpha: number; shape: number }[];
};
type Shooting = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  bornAt: number;
  tint: string;
  thickness: number;
};
type HazeState = { x: number; y: number; r: number; a: number };

export type EdgeSelection = { a: number; b: number; weight: number };

type GraphCanvasProps = {
  graph: GraphPayload;
  onSelect?: (node: GraphNode | null) => void;
  onSelectEdge?: (edge: EdgeSelection | null) => void;
  onClusterClick?: (bg: string, screenX: number, screenY: number) => void;
  onHazeFaded?: (bg: string) => void;
  onConnect?: (aId: number, bId: number) => void;
  onCreateAt?: (screenX: number, screenY: number, bg: string) => void;
  onMoveGroup?: (ids: number[]) => void;
  focusId?: number | null;
};

type Runtime = {
  canvas: HTMLCanvasElement;
  wrap: HTMLDivElement;
  zoom: d3.ZoomBehavior<HTMLCanvasElement, unknown>;
  gNodes: SimNode[];
  applyGraph: (g: GraphPayload) => void;
};

function primaryTagOf(tags: string[]): string {
  for (const t of tags) if (t !== 'highagency' && t in tagColors) return t;
  return 'friends';
}

export default function GraphCanvas({ graph, onSelect, onSelectEdge, onClusterClick, onHazeFaded, onConnect, onCreateAt, onMoveGroup, focusId }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const onSelectEdgeRef = useRef(onSelectEdge);
  const onClusterClickRef = useRef(onClusterClick);
  const onHazeFadedRef = useRef(onHazeFaded);
  const onConnectRef = useRef(onConnect);
  const onCreateAtRef = useRef(onCreateAt);
  const onMoveGroupRef = useRef(onMoveGroup);
  const runtimeRef = useRef<Runtime | null>(null);
  const graphRef = useRef<GraphPayload>(graph);
  onSelectRef.current = onSelect;
  onSelectEdgeRef.current = onSelectEdge;
  onClusterClickRef.current = onClusterClick;
  onHazeFadedRef.current = onHazeFaded;
  onConnectRef.current = onConnect;
  onCreateAtRef.current = onCreateAt;
  onMoveGroupRef.current = onMoveGroup;
  graphRef.current = graph;

  useEffect(() => {
    if (focusId == null) return;
    const rt = runtimeRef.current;
    if (!rt) return;
    const n = rt.gNodes.find((g) => g.id === focusId);
    if (!n || n.x == null || n.y == null) return;
    const w = rt.wrap.clientWidth;
    const h = rt.wrap.clientHeight;
    const k = 1.5;
    const tx = w / 2 - n.x * k;
    const ty = h / 2 - n.y * k;
    d3.select(rt.canvas)
      .transition()
      .duration(650)
      .call(rt.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  }, [focusId]);

  // mount-once effect: set up canvas, simulation, render loop, event handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = wrap.clientWidth;
    let height = wrap.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const startTime = performance.now();

    const resize = () => {
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();

    // ===== star field =====
    const twinkleStars: Star[] = [];
    const shootingStars: Shooting[] = [];
    const nebulae: Nebula[] = [];
    const dustMotes: Mote[] = [];
    const constellations: Constellation[] = [];
    const orbiters: Orbiter[] = [];
    const galaxies: Galaxy[] = [];
    const miniGalaxies: MiniGalaxy[] = [];
    const planets: Planet[] = [];
    const blackHoles: BlackHole[] = [];
    const comets: Comet[] = [];
    const asteroids: Asteroid[] = [];
    const asteroidBelts: AsteroidBelt[] = [];
    const distantGiants: Galaxy[] = [];
    const hazeState: Record<string, HazeState> = {};
    const fadedBg: Record<string, boolean> = {};
    let lastShootSpawn = 0;

    const layers = [
      { count: 520, rMin: 120, rMax: 1600, size: [0.25, 0.65], alpha: [0.08, 0.28], speed: [0.2, 0.7], depth: 0.35 },
      { count: 300, rMin: 100, rMax: 1300, size: [0.45, 1.1], alpha: [0.18, 0.5], speed: [0.4, 1.1], depth: 0.65 },
      { count: 120, rMin: 80, rMax: 1050, size: [0.9, 1.8], alpha: [0.35, 0.9], speed: [0.6, 1.6], depth: 1.0 },
    ];
    for (const lay of layers) {
      for (let i = 0; i < lay.count; i++) {
        const r = lay.rMin + Math.random() * (lay.rMax - lay.rMin);
        const ang = Math.random() * Math.PI * 2;
        const colorBias = Math.random();
        let tint = '#ffffff';
        if (colorBias > 0.9) tint = '#d8e6ff';
        else if (colorBias > 0.82) tint = '#ffe8d4';
        else if (colorBias > 0.76) tint = '#e8d4ff';
        twinkleStars.push({
          x: Math.cos(ang) * r,
          y: Math.sin(ang) * r,
          size: lay.size[0] + Math.random() * (lay.size[1] - lay.size[0]),
          baseAlpha: lay.alpha[0] + Math.random() * (lay.alpha[1] - lay.alpha[0]),
          phase: Math.random() * Math.PI * 2,
          speed: lay.speed[0] + Math.random() * (lay.speed[1] - lay.speed[0]),
          depth: lay.depth,
          tint,
          hasCross: lay.depth === 1 && Math.random() > 0.82,
        });
      }
    }

    const nebColors = ['#6b8dd4', '#8b6bd4', '#d46b8b', '#6bd4c2', '#d4b66b', '#b36bd4', '#6bd47a', '#d46b6b'];
    for (let i = 0; i < 18; i++) {
      const r = 450 + Math.random() * 900;
      const ang = Math.random() * Math.PI * 2;
      nebulae.push({
        x: Math.cos(ang) * r,
        y: Math.sin(ang) * r,
        radius: 180 + Math.random() * 320,
        color: nebColors[i % nebColors.length],
        alpha: 0.05 + Math.random() * 0.08,
        drift: (Math.random() - 0.5) * 0.05,
        driftY: (Math.random() - 0.5) * 0.05,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.1 + Math.random() * 0.2,
      });
    }

    for (let i = 0; i < 200; i++) {
      const r = 80 + Math.random() * 1200;
      const ang = Math.random() * Math.PI * 2;
      dustMotes.push({
        x: Math.cos(ang) * r,
        y: Math.sin(ang) * r,
        size: 0.3 + Math.random() * 0.6,
        alpha: 0.08 + Math.random() * 0.15,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
      });
    }

    const sources = twinkleStars.filter((s) => s.depth === 1);
    for (let c = 0; c < 14; c++) {
      if (sources.length < 4) break;
      const seed = sources[Math.floor(Math.random() * sources.length)];
      const chain: Star[] = [seed];
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
        const last = chain[chain.length - 1];
        let best: Star | null = null;
        let bestD = Infinity;
        for (const s of sources) {
          if (chain.includes(s)) continue;
          const dx = s.x - last.x;
          const dy = s.y - last.y;
          const d = dx * dx + dy * dy;
          if (d < bestD && d > 400 && d < 40000) {
            bestD = d;
            best = s;
          }
        }
        if (!best) break;
        chain.push(best);
      }
      if (chain.length >= 3) {
        constellations.push({ points: chain, alpha: 0.07 + Math.random() * 0.05, phase: Math.random() * Math.PI * 2 });
      }
    }

    const orbitRings = [120, 240, 380, 540, 700, 880, 1050, 1220];
    for (const or of orbitRings) {
      const count = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        orbiters.push({
          radius: or,
          theta: Math.random() * Math.PI * 2,
          speed: (0.06 / (or / 120)) * (Math.random() > 0.5 ? 1 : -1),
          size: 1 + Math.random() * 0.7,
          alpha: 0.3 + Math.random() * 0.35,
          trail: 0.12,
        });
      }
    }

    // shared placement points across galaxies + giants + minis so they
    // never bunch up — rejection-sample with a minimum spacing radius.
    const placedPoints: { x: number; y: number; r: number }[] = [];
    const placeAway = (rMin: number, rMax: number, spacing: number): { x: number; y: number } => {
      for (let attempt = 0; attempt < 60; attempt++) {
        const r = rMin + Math.random() * (rMax - rMin);
        const ang = Math.random() * Math.PI * 2;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        let ok = true;
        for (const p of placedPoints) {
          const dx = p.x - x;
          const dy = p.y - y;
          if (dx * dx + dy * dy < (p.r + spacing) * (p.r + spacing)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          placedPoints.push({ x, y, r: spacing });
          return { x, y };
        }
      }
      // give up on spacing — still return a point but don't record it
      const r = rMin + Math.random() * (rMax - rMin);
      const ang = Math.random() * Math.PI * 2;
      return { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
    };

    const galaxyTints = ['#c9b5ff', '#b5d7ff', '#ffd1b5', '#b5ffea', '#ffb5d7', '#d7ffb5'];
    for (let i = 0; i < 14; i++) {
      const { x, y } = placeAway(1500 + (i < 7 ? 0 : 700), i < 7 ? 2200 : 3700, 700);
      const spiral = Math.random() > 0.3 ? 1 : 0;
      galaxies.push({
        x,
        y,
        rx: 60 + Math.random() * 100,
        ry: spiral ? 60 + Math.random() * 100 : 22 + Math.random() * 32,
        rot: Math.random() * Math.PI,
        alpha: 0.09 + Math.random() * 0.1,
        tint: galaxyTints[i % galaxyTints.length],
        spiral,
        armCount: 2 + Math.floor(Math.random() * 3),
      });
    }

    // a handful of HUGE distant galaxies in the deep outer rim
    for (let i = 0; i < 4; i++) {
      const { x, y } = placeAway(2400, 4000, 1100);
      const spiral = Math.random() > 0.35 ? 1 : 0;
      distantGiants.push({
        x,
        y,
        rx: 180 + Math.random() * 220,
        ry: spiral ? 180 + Math.random() * 220 : 60 + Math.random() * 90,
        rot: Math.random() * Math.PI,
        alpha: 0.04 + Math.random() * 0.05,
        tint: galaxyTints[i % galaxyTints.length],
        spiral,
        armCount: 2 + Math.floor(Math.random() * 3),
      });
    }

    // small background galaxies — clearly galaxy-shaped
    const miniTints = ['#c9b5ff', '#b5d7ff', '#ffd1b5', '#b5ffea', '#ffb5e6', '#e6d4ff'];
    const miniKinds: MiniGalaxy['kind'][] = ['spiral', 'spiral', 'barred', 'elliptical'];
    for (let i = 0; i < 22; i++) {
      const { x, y } = placeAway(1400, 3500, 360);
      miniGalaxies.push({
        x,
        y,
        size: 8 + Math.random() * 22,
        rot: Math.random() * Math.PI * 2,
        tint: miniTints[i % miniTints.length],
        arms: 2 + Math.floor(Math.random() * 3),
        tightness: 2.5 + Math.random() * 2.5,
        kind: miniKinds[i % miniKinds.length],
      });
    }

    // planets scattered in outer space
    const planetTints = ['#d4a674', '#7ab0d4', '#d474a6', '#74d4a6', '#b574d4', '#d4d474'];
    for (let i = 0; i < 24; i++) {
      const r = 600 + Math.random() * 2400;
      const ang = Math.random() * Math.PI * 2;
      planets.push({
        x: Math.cos(ang) * r,
        y: Math.sin(ang) * r,
        radius: 4 + Math.random() * 9,
        tint: planetTints[i % planetTints.length],
        ring: Math.random() > 0.55,
        ringTilt: Math.random() * Math.PI,
        ringTint: planetTints[(i + 3) % planetTints.length],
        glow: 0.3 + Math.random() * 0.5,
      });
    }

    // a few distant black holes with accretion rings
    for (let i = 0; i < 4; i++) {
      const r = 1100 + Math.random() * 1600;
      const ang = Math.random() * Math.PI * 2;
      blackHoles.push({
        x: Math.cos(ang) * r,
        y: Math.sin(ang) * r,
        radius: 14 + Math.random() * 14,
        rot: Math.random() * Math.PI * 2,
        spinSpeed: 0.3 + Math.random() * 0.4,
      });
    }

    // long-period comets — big sweeping orbits that pass through outer space
    const cometTints = ['#b5d7ff', '#ffd1b5', '#c9b5ff', '#b5ffea'];
    for (let i = 0; i < 14; i++) {
      const wide = i >= 7;
      comets.push({
        orbitCx: (Math.random() - 0.5) * (wide ? 600 : 200),
        orbitCy: (Math.random() - 0.5) * (wide ? 600 : 200),
        a: wide ? 1400 + Math.random() * 1200 : 650 + Math.random() * 450,
        b: wide ? 700 + Math.random() * 600 : 280 + Math.random() * 220,
        theta: Math.random() * Math.PI * 2,
        speed: (wide ? 0.018 : 0.04) + Math.random() * 0.05,
        tilt: Math.random() * Math.PI * 2,
        tint: cometTints[i % cometTints.length],
      });
    }

    // freely-drifting asteroids in the outer rim
    for (let i = 0; i < 180; i++) {
      const r = 750 + Math.random() * 2500;
      const ang = Math.random() * Math.PI * 2;
      asteroids.push({
        x: Math.cos(ang) * r,
        y: Math.sin(ang) * r,
        size: 0.8 + Math.random() * 2.6,
        rot: Math.random() * Math.PI * 2,
        alpha: 0.18 + Math.random() * 0.35,
        shape: Math.random() * 1000,
      });
    }

    // asteroid belts — rings of dense small rocks orbiting the deep outer rim
    for (let bi = 0; bi < 3; bi++) {
      const cx = (Math.random() - 0.5) * 200;
      const cy = (Math.random() - 0.5) * 200;
      const rInner = 1400 + bi * 500 + Math.random() * 200;
      const rOuter = rInner + 80 + Math.random() * 100;
      const rocks: AsteroidBelt['rocks'] = [];
      const count = 220 + Math.floor(Math.random() * 120);
      for (let i = 0; i < count; i++) {
        rocks.push({
          angle: Math.random() * Math.PI * 2,
          rad: rInner + Math.random() * (rOuter - rInner),
          size: 0.5 + Math.random() * 1.6,
          alpha: 0.18 + Math.random() * 0.35,
          shape: Math.random() * 1000,
        });
      }
      asteroidBelts.push({ cx, cy, rInner, rOuter, rocks });
    }

    // ===== persistent data arrays (mutated across graph updates) =====
    const gNodes: SimNode[] = [];
    const gLinks: SimLink[] = [];

    const anchorForce = () => {
      for (const n of gNodes) {
        if (n._ax == null || n._ay == null) continue;
        if (n.fx != null) continue;
        n.vx = (n.vx ?? 0) + (n._ax - (n.x ?? 0)) * 0.22;
        n.vy = (n.vy ?? 0) + (n._ay - (n.y ?? 0)) * 0.22;
      }
    };

    const linkForce = d3
      .forceLink<SimNode, SimLink>(gLinks)
      .id((d) => d.id)
      .distance((l) => 80 / Math.sqrt(l.weight || 1))
      .strength(0.05);

    const sim = d3
      .forceSimulation<SimNode>(gNodes)
      .force('charge', d3.forceManyBody<SimNode>().strength(-40))
      .force('link', linkForce)
      .force('collide', d3.forceCollide<SimNode>().radius((n) => 8 + n.s * 0.7).strength(0.6))
      .force('anchor', anchorForce)
      .alpha(0)
      .alphaDecay(0.06)
      .velocityDecay(0.72);
    sim.stop();

    // lay out ONE bucket's nodes as regular polygons around its center.
    // for n<=8, single n-gon ring. For larger, center + rings of 6/12/18.
    // only touches unpinned nodes. x/y only set if unset (first placement).
    const layoutBucket = (bg: string, bucket: SimNode[]) => {
      const c = bgCenters[bg] ?? bgCenters.online;
      const unpinned = bucket.filter((n) => !n._pinned);
      unpinned.sort((a, b) => b.s - a.s || a.name.localeCompare(b.name));
      const total = unpinned.length;
      if (total === 0) return;
      // orient each bucket so the "top" vertex is always up in its local frame
      const orient = -Math.PI / 2;
      const place = (node: SimNode, theta: number, radius: number) => {
        const ax = c.x + Math.cos(theta) * radius;
        const ay = c.y + Math.sin(theta) * radius;
        node._ax = ax;
        node._ay = ay;
        if (node.x == null || node.y == null) {
          node.x = ax;
          node.y = ay;
        }
      };
      if (total === 1) {
        place(unpinned[0], 0, 0);
        return;
      }
      if (total >= 2 && total <= 8) {
        // single regular polygon
        const radius = 22 + total * 6;
        for (let i = 0; i < total; i++) {
          const theta = orient + (i / total) * Math.PI * 2;
          place(unpinned[i], theta, radius);
        }
        return;
      }
      // larger: 1 center + concentric polygons of 7, 13, 19...
      let index = 0;
      place(unpinned[index++], 0, 0);
      const ringSizes = [7, 13, 19, 25];
      let ring = 0;
      while (index < total) {
        const cap = ringSizes[ring] ?? ringSizes[ringSizes.length - 1];
        const take = Math.min(cap, total - index);
        const radius = (ring + 1) * 44;
        const twist = ring % 2 === 0 ? 0 : Math.PI / cap;
        for (let i = 0; i < take; i++) {
          const theta = orient + twist + (i / take) * Math.PI * 2;
          place(unpinned[index++], theta, radius);
        }
        ring++;
      }
    };

    const relayoutAll = () => {
      const byBucket: Record<string, SimNode[]> = {};
      for (const n of gNodes) {
        const bg = n.bg in bgCenters ? n.bg : 'online';
        (byBucket[bg] ||= []).push(n);
      }
      for (const bg of Object.keys(byBucket)) layoutBucket(bg, byBucket[bg]);
    };

    const applyGraph = (payload: GraphPayload) => {
      const incomingById = new Map(payload.nodes.map((n) => [n.id, n]));
      const existingById = new Map(gNodes.map((n) => [n.id, n]));

      // drop nodes no longer present
      for (let i = gNodes.length - 1; i >= 0; i--) {
        if (!incomingById.has(gNodes[i].id)) gNodes.splice(i, 1);
      }

      // upsert nodes: mutate existing in place, add new at their bucket center
      for (const n of payload.nodes) {
        const ex = existingById.get(n.id);
        const tags = Array.isArray(n.tags) ? [...n.tags] : [];
        if (ex) {
          ex.name = n.name;
          ex.bg = n.bg;
          ex.strength = n.strength;
          ex.s = n.strength;
          ex.tags = tags;
          ex.description = n.description;
          ex.primary = primaryTagOf(tags);
        } else {
          const c = bgCenters[n.bg in bgCenters ? n.bg : 'online'];
          const jitter = 2 + Math.random() * 6;
          const ang = Math.random() * Math.PI * 2;
          const sn: SimNode = {
            ...n,
            tags,
            s: n.strength,
            primary: primaryTagOf(tags),
            x: c.x + Math.cos(ang) * jitter,
            y: c.y + Math.sin(ang) * jitter,
            vx: 0,
            vy: 0,
            _starPhase: Math.random() * Math.PI * 2,
            _pinned: false,
          };
          gNodes.push(sn);
        }
      }

      relayoutAll();

      // rebuild links by id -> node ref. replace gLinks array contents in place.
      gLinks.length = 0;
      const nodeById = new Map(gNodes.map((n) => [n.id, n]));
      for (const e of payload.edges) {
        const s = nodeById.get(e.source);
        const t = nodeById.get(e.target);
        if (!s || !t) continue;
        const strength = Math.min(10, 2 + e.weight * 2);
        gLinks.push({ source: s, target: t, weight: e.weight, strength });
      }

      sim.nodes(gNodes);
      linkForce.links(gLinks);
      sim.alpha(0.1).restart();
    };

    // ===== zoom/pan =====
    const currentTransform = { x: width / 2, y: height / 2, k: 1 };
    const hitNodeAt = (clientX: number, clientY: number): SimNode | null => {
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const wx = (mx - currentTransform.x) / currentTransform.k;
      const wy = (my - currentTransform.y) / currentTransform.k;
      let best: SimNode | null = null;
      let bestD = 22 * 22;
      for (const n of gNodes) {
        const dx = (n.x ?? 0) - wx;
        const dy = (n.y ?? 0) - wy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
          bestD = d2;
          best = n;
        }
      }
      return best;
    };
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.25, 4])
      .filter((ev) => {
        if (ev.type === 'wheel') return true;
        if ((ev as KeyboardEvent).shiftKey) return false;
        if ((ev as KeyboardEvent).altKey) return false;
        if ((ev as KeyboardEvent).metaKey || (ev as KeyboardEvent).ctrlKey) return false;
        if (ev.button && ev.button !== 0) return false;
        const cx = (ev as PointerEvent).clientX ?? (ev as MouseEvent).clientX;
        const cy = (ev as PointerEvent).clientY ?? (ev as MouseEvent).clientY;
        if (cx == null || cy == null) return true;
        return hitNodeAt(cx, cy) == null;
      })
      .on('zoom', (ev) => {
        currentTransform.x = ev.transform.x;
        currentTransform.y = ev.transform.y;
        currentTransform.k = ev.transform.k;
      });
    const sel = d3.select(canvas);
    sel.call(zoom);
    zoom.transform(sel, d3.zoomIdentity.translate(currentTransform.x, currentTransform.y).scale(1));

    // ===== drag =====
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMoved = false;
    let dragGroupStart: Array<{ n: SimNode; ox: number; oy: number }> = [];
    const drag = d3
      .drag<HTMLCanvasElement, unknown>()
      .clickDistance(6)
      .filter(
        (event) =>
          !(event as PointerEvent).shiftKey &&
          !(event as PointerEvent).altKey &&
          !(event as PointerEvent).metaKey &&
          !(event as PointerEvent).ctrlKey &&
          !(event as MouseEvent).button,
      )
      .subject((event) => {
        const [mx, my] = d3.pointer(event, canvas);
        const wx = (mx - currentTransform.x) / currentTransform.k;
        const wy = (my - currentTransform.y) / currentTransform.k;
        let best: SimNode | null = null;
        let bestD = 22 * 22;
        for (const n of gNodes) {
          const dx = (n.x ?? 0) - wx;
          const dy = (n.y ?? 0) - wy;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) {
            bestD = d2;
            best = n;
          }
        }
        return best;
      })
      .on('start', (event) => {
        dragMoved = false;
        dragStartX = event.x;
        dragStartY = event.y;
        if (!event.active) sim.alphaTarget(0.25).restart();
        const n = event.subject as SimNode;
        n.fx = n.x;
        n.fy = n.y;
        // if this node is part of a multi-selection, pin all selected nodes for group drag
        dragGroupStart = [];
        if (selectedIds.size > 1 && selectedIds.has(n.id)) {
          for (const other of gNodes) {
            if (!selectedIds.has(other.id)) continue;
            other.fx = other.x ?? 0;
            other.fy = other.y ?? 0;
            dragGroupStart.push({ n: other, ox: other.x ?? 0, oy: other.y ?? 0 });
          }
        }
      })
      .on('drag', (event) => {
        const dx = event.x - dragStartX;
        const dy = event.y - dragStartY;
        if (dx * dx + dy * dy > 36) dragMoved = true;
        const n = event.subject as SimNode;
        if (dragGroupStart.length > 0) {
          const dxT = event.x - (n.x ?? 0);
          const dyT = event.y - (n.y ?? 0);
          for (const g of dragGroupStart) {
            g.n.fx = (g.n.fx ?? g.ox) + dxT;
            g.n.fy = (g.n.fy ?? g.oy) + dyT;
          }
        } else {
          n.fx = event.x;
          n.fy = event.y;
        }
      })
      .on('end', (event) => {
        if (!event.active) sim.alphaTarget(0);
        const n = event.subject as SimNode;
        if (dragMoved) {
          if (dragGroupStart.length > 0) {
            for (const g of dragGroupStart) {
              g.n._ax = g.n.fx ?? undefined;
              g.n._ay = g.n.fy ?? undefined;
              g.n._pinned = true;
              g.n.fx = null;
              g.n.fy = null;
            }
            onMoveGroupRef.current?.(dragGroupStart.map((g) => g.n.id));
          } else {
            n._ax = n.fx ?? undefined;
            n._ay = n.fy ?? undefined;
            n._pinned = true;
            n.fx = null;
            n.fy = null;
          }
          sim.alpha(0.15);
        } else {
          n.fx = null;
          n.fy = null;
          onSelectRef.current?.({ id: n.id, name: n.name, bg: n.bg, strength: n.s, tags: n.tags, description: n.description });
          onSelectEdgeRef.current?.(null);
        }
        dragGroupStart = [];
      });
    sel.call(drag);

    // ===== shift+drag to connect two dots =====
    let connectSource: SimNode | null = null;
    let connectMouseW = { x: 0, y: 0 };
    let justConnected = false;
    const screenToWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      return {
        x: (mx - currentTransform.x) / currentTransform.k,
        y: (my - currentTransform.y) / currentTransform.k,
      };
    };
    // ===== marquee (cmd/ctrl + drag) =====
    let marquee: { sx: number; sy: number; ex: number; ey: number } | null = null;
    const selectedIds = new Set<number>();
    let groupDragging = false;
    let groupDragLastW = { x: 0, y: 0 };
    let suppressClickUntil = 0;

    const nearestBgAt = (wx: number, wy: number): string => {
      let best = 'online';
      let bestD = Infinity;
      for (const bg of bgOrder) {
        const c = bgCenters[bg];
        const d = (c.x - wx) ** 2 + (c.y - wy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = bg;
        }
      }
      return best;
    };

    const onPointerDown = (ev: PointerEvent) => {
      // alt+click on empty → create new dot
      if (ev.altKey && !ev.shiftKey) {
        const hit = hitNodeAt(ev.clientX, ev.clientY);
        if (hit) return;
        const w = screenToWorld(ev.clientX, ev.clientY);
        const bg = nearestBgAt(w.x, w.y);
        onCreateAtRef.current?.(ev.clientX, ev.clientY, bg);
        suppressClickUntil = performance.now() + 400;
        ev.stopPropagation();
        ev.preventDefault();
        return;
      }
      // cmd/ctrl drag → marquee or move existing group
      if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey) {
        const w = screenToWorld(ev.clientX, ev.clientY);
        // if clicking on an already-selected node, start group drag
        const hit = hitNodeAt(ev.clientX, ev.clientY);
        if (hit && selectedIds.has(hit.id)) {
          groupDragging = true;
          groupDragLastW = w;
          for (const n of gNodes) {
            if (selectedIds.has(n.id)) {
              n.fx = n.x ?? 0;
              n.fy = n.y ?? 0;
            }
          }
          sim.alphaTarget(0.15).restart();
        } else {
          marquee = { sx: w.x, sy: w.y, ex: w.x, ey: w.y };
          selectedIds.clear();
        }
        try {
          canvas.setPointerCapture(ev.pointerId);
        } catch {}
        ev.stopPropagation();
        ev.preventDefault();
        return;
      }
      // shift+drag to connect
      if (!ev.shiftKey) return;
      const hit = hitNodeAt(ev.clientX, ev.clientY);
      if (!hit) return;
      connectSource = hit;
      connectMouseW = screenToWorld(ev.clientX, ev.clientY);
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {}
      ev.stopPropagation();
      ev.preventDefault();
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (marquee) {
        const w = screenToWorld(ev.clientX, ev.clientY);
        marquee.ex = w.x;
        marquee.ey = w.y;
        ev.stopPropagation();
        return;
      }
      if (groupDragging) {
        const w = screenToWorld(ev.clientX, ev.clientY);
        const dx = w.x - groupDragLastW.x;
        const dy = w.y - groupDragLastW.y;
        groupDragLastW = w;
        for (const n of gNodes) {
          if (!selectedIds.has(n.id)) continue;
          n.fx = (n.fx ?? n.x ?? 0) + dx;
          n.fy = (n.fy ?? n.y ?? 0) + dy;
        }
        sim.alpha(0.2);
        ev.stopPropagation();
        return;
      }
      if (!connectSource) return;
      connectMouseW = screenToWorld(ev.clientX, ev.clientY);
      ev.stopPropagation();
    };
    const onPointerUp = (ev: PointerEvent) => {
      if (marquee) {
        const minX = Math.min(marquee.sx, marquee.ex);
        const maxX = Math.max(marquee.sx, marquee.ex);
        const minY = Math.min(marquee.sy, marquee.ey);
        const maxY = Math.max(marquee.sy, marquee.ey);
        selectedIds.clear();
        for (const n of gNodes) {
          const nx = n.x ?? 0;
          const ny = n.y ?? 0;
          if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY) {
            selectedIds.add(n.id);
          }
        }
        marquee = null;
        suppressClickUntil = performance.now() + 300;
        try {
          canvas.releasePointerCapture(ev.pointerId);
        } catch {}
        ev.stopPropagation();
        return;
      }
      if (groupDragging) {
        groupDragging = false;
        sim.alphaTarget(0);
        for (const n of gNodes) {
          if (!selectedIds.has(n.id)) continue;
          n._ax = n.fx ?? undefined;
          n._ay = n.fy ?? undefined;
          n._pinned = true;
          n.fx = null;
          n.fy = null;
        }
        onMoveGroupRef.current?.(Array.from(selectedIds));
        suppressClickUntil = performance.now() + 300;
        try {
          canvas.releasePointerCapture(ev.pointerId);
        } catch {}
        ev.stopPropagation();
        return;
      }
      if (!connectSource) return;
      const target = hitNodeAt(ev.clientX, ev.clientY);
      if (target && target.id !== connectSource.id) {
        onConnectRef.current?.(connectSource.id, target.id);
        justConnected = true;
      }
      connectSource = null;
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {}
      ev.stopPropagation();
    };
    canvas.addEventListener('pointerdown', onPointerDown, true);
    canvas.addEventListener('pointermove', onPointerMove, true);
    canvas.addEventListener('pointerup', onPointerUp, true);
    canvas.addEventListener('pointercancel', onPointerUp, true);

    const onClick = (ev: MouseEvent) => {
      if (justConnected) {
        justConnected = false;
        return;
      }
      if (performance.now() < suppressClickUntil) return;
      if (ev.altKey || ev.metaKey || ev.ctrlKey) return;
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const wx = (mx - currentTransform.x) / currentTransform.k;
      const wy = (my - currentTransform.y) / currentTransform.k;

      let hitNode: SimNode | null = null;
      let hitD = 22 * 22;
      for (const n of gNodes) {
        const dx = (n.x ?? 0) - wx;
        const dy = (n.y ?? 0) - wy;
        const d2 = dx * dx + dy * dy;
        if (d2 < hitD) {
          hitD = d2;
          hitNode = n;
        }
      }
      if (hitNode) {
        onSelectRef.current?.({
          id: hitNode.id,
          name: hitNode.name,
          bg: hitNode.bg,
          strength: hitNode.s,
          tags: hitNode.tags,
          description: hitNode.description,
        });
        onSelectEdgeRef.current?.(null);
        return;
      }

      let bestEdge: SimLink | null = null;
      let bestEdgeDist = 14 / currentTransform.k;
      for (const l of gLinks) {
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        if (s.x == null || s.y == null || t.x == null || t.y == null) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < 0.01) continue;
        const u = ((wx - s.x) * dx + (wy - s.y) * dy) / len2;
        if (u < 0 || u > 1) continue;
        const px = s.x + u * dx;
        const py = s.y + u * dy;
        const d = Math.hypot(wx - px, wy - py);
        if (d < bestEdgeDist) {
          bestEdgeDist = d;
          bestEdge = l;
        }
      }
      if (bestEdge) {
        const s = bestEdge.source as SimNode;
        const t = bestEdge.target as SimNode;
        onSelectEdgeRef.current?.({ a: s.id, b: t.id, weight: bestEdge.weight });
        return;
      }

      // check if click is within a visible haze and has no user-set name yet
      let bestHazeBg: string | null = null;
      let bestHazeD2 = Infinity;
      const bnames = graphRef.current.bucketNames ?? {};
      for (const bg of bgOrder) {
        const st = hazeState[bg];
        if (!st || st.a < 0.12) continue;
        if (bnames[bg]) continue; // already named, skip
        const dx = wx - st.x;
        const dy = wy - st.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < st.r * st.r && d2 < bestHazeD2) {
          bestHazeD2 = d2;
          bestHazeBg = bg;
        }
      }
      if (bestHazeBg) {
        onClusterClickRef.current?.(bestHazeBg, ev.clientX, ev.clientY);
        onSelectRef.current?.(null);
        onSelectEdgeRef.current?.(null);
        return;
      }

      onSelectRef.current?.(null);
      onSelectEdgeRef.current?.(null);
    };
    canvas.addEventListener('click', onClick);

    runtimeRef.current = { canvas, wrap, zoom, gNodes, applyGraph };

    // initial seed from whatever graph was present at mount
    applyGraph(graphRef.current);

    // ===== render loop =====
    let raf = 0;
    const draw = () => {
      const now = performance.now();
      sim.tick();

      if (now - lastShootSpawn > 1400 + Math.random() * 800) {
        lastShootSpawn = now;
        const edge = Math.floor(Math.random() * 4);
        const span = 900;
        let x = 0,
          y = 0,
          dx = 0,
          dy = 0;
        if (edge === 0) {
          x = -span;
          y = -span + Math.random() * span * 2;
          dx = 1;
          dy = 0.35;
        } else if (edge === 1) {
          x = span;
          y = -span + Math.random() * span * 2;
          dx = -1;
          dy = 0.35;
        } else if (edge === 2) {
          x = -span + Math.random() * span * 2;
          y = -span;
          dx = 0.4;
          dy = 1;
        } else {
          x = -span + Math.random() * span * 2;
          y = span;
          dx = 0.4;
          dy = -1;
        }
        const speed = 4 + Math.random() * 4;
        const mag = Math.sqrt(dx * dx + dy * dy);
        const tints = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#b5d7ff', '#ffd1b5', '#c9b5ff'];
        shootingStars.push({
          x,
          y,
          vx: (dx / mag) * speed,
          vy: (dy / mag) * speed,
          life: 0,
          maxLife: 90 + Math.random() * 60,
          bornAt: now,
          tint: tints[Math.floor(Math.random() * tints.length)],
          thickness: 0.9 + Math.random() * 0.8,
        });
      }

      for (const m of dustMotes) {
        m.x += m.vx;
        m.y += m.vy;
        if (m.x > 1200) m.x = -1200;
        if (m.x < -1200) m.x = 1200;
        if (m.y > 1200) m.y = -1200;
        if (m.y < -1200) m.y = 1200;
      }
      for (const o of orbiters) o.theta += o.speed * 0.016;
      for (const neb of nebulae) {
        neb.x += neb.drift;
        neb.y += neb.driftY;
      }
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i];
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.life += 1;
        if (ss.life > ss.maxLife) shootingStars.splice(i, 1);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bgGrad = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        0,
        canvas.width / 2,
        canvas.height / 2,
        Math.max(canvas.width, canvas.height)
      );
      bgGrad.addColorStop(0, '#0a0c18');
      bgGrad.addColorStop(0.55, '#05060d');
      bgGrad.addColorStop(1, '#02030a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(currentTransform.x, currentTransform.y);
      ctx.scale(currentTransform.k, currentTransform.k);

      // ===== live cluster membership =====
      const MAX_JOIN = 280;
      const MAX_JOIN_SQ = MAX_JOIN * MAX_JOIN;
      const seedCenters: Record<string, { x: number; y: number }> = {};
      for (const bg of bgOrder) {
        const st = hazeState[bg];
        if (st && st.a > 0.05) seedCenters[bg] = { x: st.x, y: st.y };
        else seedCenters[bg] = { x: bgCenters[bg].x, y: bgCenters[bg].y };
      }

      type Live = { sx: number; sy: number; n: number; maxD2: number; cx: number; cy: number };
      const liveClusters: Record<string, Live> = {};
      for (const bg of bgOrder) liveClusters[bg] = { sx: 0, sy: 0, n: 0, maxD2: 0, cx: 0, cy: 0 };

      for (const n of gNodes) {
        let bestBg: string | null = null;
        let bestD2 = Infinity;
        for (const bg of bgOrder) {
          const s = seedCenters[bg];
          const dx = (n.x ?? 0) - s.x;
          const dy = (n.y ?? 0) - s.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestBg = bg;
          }
        }
        if (bestBg && bestD2 < MAX_JOIN_SQ) {
          n._liveBg = bestBg;
          const c = liveClusters[bestBg];
          c.sx += n.x ?? 0;
          c.sy += n.y ?? 0;
          c.n += 1;
        } else {
          n._liveBg = null;
        }
      }
      for (const bg in liveClusters) {
        const c = liveClusters[bg];
        if (c.n > 0) {
          c.cx = c.sx / c.n;
          c.cy = c.sy / c.n;
        }
      }
      for (const n of gNodes) {
        if (!n._liveBg) continue;
        const c = liveClusters[n._liveBg];
        if (!c || c.n === 0) continue;
        const dx = (n.x ?? 0) - c.cx;
        const dy = (n.y ?? 0) - c.cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > c.maxD2) c.maxD2 = d2;
      }
      const counts: Record<string, number> = {};
      for (const bg in liveClusters) counts[bg] = liveClusters[bg].n;

      const tSec = (now - startTime) / 1000;
      const hazePulse = 1 + 0.06 * Math.sin(tSec * 0.8);
      const lerp = 0.14;
      const shrinkLerp = 0.05;
      for (const bg of bgOrder) {
        const live = liveClusters[bg];
        const seed = bgCenters[bg];
        let st = hazeState[bg];
        if (!st) {
          st = hazeState[bg] = { x: seed.x, y: seed.y, r: 0, a: 0 };
        }
        if (live.n >= 2) {
          const spread = Math.sqrt(live.maxD2);
          // density = tight clusters fire bright, spread ones fade
          // more sensitive: wider spread tolerance + higher base lift
          const compactness = (live.n + 0.8) / (1 + spread / 130);
          const targetR = Math.max(90, spread * 1.4 + 70);
          const targetA = Math.min(0.95, compactness * 0.32);
          const radiusLerp = targetR > st.r ? lerp : shrinkLerp;
          const alphaLerp = targetA > st.a ? lerp : shrinkLerp;
          st.x += (live.cx - st.x) * lerp;
          st.y += (live.cy - st.y) * lerp;
          st.r += (targetR - st.r) * radiusLerp;
          st.a += (targetA - st.a) * alphaLerp;
        } else {
          st.a += (0 - st.a) * 0.08;
          st.r += (40 - st.r) * 0.08;
        }
      }

      // ===== fire haze-faded callback once per cluster when stored name drops below visible =====
      const bucketNamesForFade = graphRef.current.bucketNames ?? {};
      for (const bg of bgOrder) {
        const st = hazeState[bg];
        if (!st) continue;
        if (bucketNamesForFade[bg] && st.a < 0.04) {
          if (!fadedBg[bg]) {
            fadedBg[bg] = true;
            onHazeFadedRef.current?.(bg);
          }
        } else if (st.a > 0.12) {
          fadedBg[bg] = false;
        }
      }

      // ===== haze layer (dull mist — source-over so it reads as muted, not luminous) =====
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (const bg of bgOrder) {
        const st = hazeState[bg];
        if (!st || st.a < 0.01) continue;
        const color = bgColors[bg];
        // desaturate the cluster color toward a cool gray so the haze stays dull
        const dull = mixHex(color, '#8090a8', 0.65);
        const radius = st.r * hazePulse;
        const aa = st.a;

        // soft body — higher alpha, flat muted tone
        const body = ctx.createRadialGradient(st.x, st.y, 0, st.x, st.y, radius);
        body.addColorStop(0, hexToRgba(dull, 0.32 * aa));
        body.addColorStop(0.35, hexToRgba(dull, 0.22 * aa));
        body.addColorStop(0.7, hexToRgba(dull, 0.1 * aa));
        body.addColorStop(1, hexToRgba(dull, 0));
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(st.x, st.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // three drifting wisps for billowy shape
        for (let i = 0; i < 3; i++) {
          const theta = (i / 3) * Math.PI * 2 + tSec * 0.12 + bg.length * 0.6;
          const wobble = 0.5 + 0.15 * Math.sin(tSec * 0.6 + i * 1.3);
          const lx = st.x + Math.cos(theta) * radius * 0.35 * wobble;
          const ly = st.y + Math.sin(theta) * radius * 0.35 * wobble;
          const lr = radius * 0.55;
          const lobe = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
          lobe.addColorStop(0, hexToRgba(dull, 0.16 * aa));
          lobe.addColorStop(0.5, hexToRgba(dull, 0.07 * aa));
          lobe.addColorStop(1, hexToRgba(dull, 0));
          ctx.fillStyle = lobe;
          ctx.beginPath();
          ctx.arc(lx, ly, lr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // ===== nebulae =====
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const neb of nebulae) {
        const pulse = 0.85 + 0.15 * Math.sin(neb.pulsePhase + tSec * neb.pulseSpeed);
        const r = neb.radius * pulse;
        const g = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, r);
        g.addColorStop(0, hexToRgba(neb.color, neb.alpha * 0.55));
        g.addColorStop(0.35, hexToRgba(neb.color, neb.alpha * 0.25));
        g.addColorStop(1, hexToRgba(neb.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(neb.x, neb.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ===== galaxies (regular + distant giants) =====
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const gx of [...distantGiants, ...galaxies]) {
        ctx.save();
        ctx.translate(gx.x, gx.y);
        ctx.rotate(gx.rot + tSec * 0.015);
        const ratio = gx.ry / gx.rx;

        // outer halo
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, gx.rx * 1.9);
        halo.addColorStop(0, hexToRgba(gx.tint, gx.alpha * 0.55));
        halo.addColorStop(0.45, hexToRgba(gx.tint, gx.alpha * 0.18));
        halo.addColorStop(1, hexToRgba(gx.tint, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.ellipse(0, 0, gx.rx * 1.9, gx.ry * 1.9, 0, 0, Math.PI * 2);
        ctx.fill();

        // disc glow base — warm interior shading to cool outer
        const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, gx.rx);
        gg.addColorStop(0, hexToRgba('#fff4d6', gx.alpha * 1.8));
        gg.addColorStop(0.22, hexToRgba('#ffd9a8', gx.alpha * 1.1));
        gg.addColorStop(0.55, hexToRgba(gx.tint, gx.alpha * 0.55));
        gg.addColorStop(1, hexToRgba(gx.tint, 0));
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.ellipse(0, 0, gx.rx, gx.ry, 0, 0, Math.PI * 2);
        ctx.fill();

        if (gx.spiral) {
          // dense, color-graded spiral arm point clouds
          const armPoints = 260;
          for (let arm = 0; arm < gx.armCount; arm++) {
            const armOffset = (arm / gx.armCount) * Math.PI * 2;
            for (let p = 0; p < armPoints; p++) {
              const t = p / armPoints;
              const radius = Math.pow(t, 0.72) * gx.rx;
              const twist = armOffset + t * 6.8;
              const armWidth = (1 - t * 0.4) * gx.rx * 0.085;
              const perp = (Math.random() - 0.5) * armWidth * 2;
              const cx = Math.cos(twist) * radius;
              const cy = Math.sin(twist) * radius;
              const px = cx + Math.cos(twist + Math.PI / 2) * perp;
              const py = (cy + Math.sin(twist + Math.PI / 2) * perp) * ratio;
              const armTint = t > 0.55 ? '#cfe2ff' : t > 0.3 ? '#e8f0ff' : '#ffe6b8';
              const a = gx.alpha * (1 - t * 0.55) * 1.5;
              ctx.fillStyle = hexToRgba(armTint, a);
              const sz = 0.55 + (1 - t) * 0.85;
              ctx.beginPath();
              ctx.arc(px, py, sz, 0, Math.PI * 2);
              ctx.fill();
            }
            // HII regions — pink star-forming nebulae scattered along the arm
            const hiiCount = Math.max(4, Math.floor(gx.rx / 22));
            for (let h = 0; h < hiiCount; h++) {
              const t = 0.22 + Math.random() * 0.7;
              const radius = Math.pow(t, 0.72) * gx.rx;
              const twist = armOffset + t * 6.8 + (Math.random() - 0.5) * 0.35;
              const px = Math.cos(twist) * radius;
              const py = Math.sin(twist) * radius * ratio;
              const hr = gx.rx * (0.05 + Math.random() * 0.04);
              const hii = ctx.createRadialGradient(px, py, 0, px, py, hr);
              const hueSwap = Math.random() > 0.5 ? '#ff9ec8' : '#9ec8ff';
              hii.addColorStop(0, hexToRgba(hueSwap, gx.alpha * 2.2));
              hii.addColorStop(0.5, hexToRgba(hueSwap, gx.alpha * 0.6));
              hii.addColorStop(1, hexToRgba(hueSwap, 0));
              ctx.fillStyle = hii;
              ctx.beginPath();
              ctx.arc(px, py, hr, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else {
          // elliptical galaxy: dense star cloud, no arms
          for (let p = 0; p < 320; p++) {
            const t = Math.pow(Math.random(), 1.4);
            const ang = Math.random() * Math.PI * 2;
            const px = Math.cos(ang) * t * gx.rx;
            const py = Math.sin(ang) * t * gx.ry;
            ctx.fillStyle = hexToRgba('#ffe6b8', gx.alpha * (1 - t) * 1.4);
            ctx.beginPath();
            ctx.arc(px, py, 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // bright bloomy core
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, gx.rx * 0.32);
        core.addColorStop(0, hexToRgba('#ffffff', Math.min(0.95, gx.alpha * 4)));
        core.addColorStop(0.3, hexToRgba('#fff0cc', gx.alpha * 1.8));
        core.addColorStop(1, hexToRgba(gx.tint, 0));
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, gx.rx * 0.32, 0, Math.PI * 2);
        ctx.fill();

        // tiny pinprick nucleus
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, gx.alpha * 6)})`;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.2, gx.rx * 0.04), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
      ctx.restore();

      // ===== mini galaxies (small, clearly galaxy-shaped) =====
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const mg of miniGalaxies) {
        ctx.save();
        ctx.translate(mg.x, mg.y);
        ctx.rotate(mg.rot + tSec * 0.03);

        // halo
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, mg.size * 1.6);
        halo.addColorStop(0, hexToRgba(mg.tint, 0.15));
        halo.addColorStop(0.5, hexToRgba(mg.tint, 0.05));
        halo.addColorStop(1, hexToRgba(mg.tint, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, mg.size * 1.6, 0, Math.PI * 2);
        ctx.fill();

        if (mg.kind === 'elliptical') {
          // dense star cloud
          for (let p = 0; p < 110; p++) {
            const t = Math.pow(Math.random(), 1.4);
            const ang = Math.random() * Math.PI * 2;
            const px = Math.cos(ang) * t * mg.size;
            const py = Math.sin(ang) * t * mg.size * 0.72;
            ctx.fillStyle = hexToRgba('#ffe6b8', (1 - t) * 0.45);
            ctx.beginPath();
            ctx.arc(px, py, 0.55, 0, Math.PI * 2);
            ctx.fill();
          }
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, mg.size);
          g.addColorStop(0, hexToRgba('#fff0cc', 0.55));
          g.addColorStop(0.4, hexToRgba(mg.tint, 0.2));
          g.addColorStop(1, hexToRgba(mg.tint, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(0, 0, mg.size, mg.size * 0.72, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // dense, color-graded spiral arms
          const steps = 110;
          for (let arm = 0; arm < mg.arms; arm++) {
            const armOffset = (arm / mg.arms) * Math.PI * 2;
            for (let p = 0; p < steps; p++) {
              const t = p / steps;
              const radius = Math.pow(t, 0.75) * mg.size;
              const twist = armOffset + t * mg.tightness;
              const armWidth = (1 - t * 0.4) * mg.size * 0.09;
              const perp = (Math.random() - 0.5) * armWidth * 2;
              const px = Math.cos(twist) * radius + Math.cos(twist + Math.PI / 2) * perp;
              const py = Math.sin(twist) * radius + Math.sin(twist + Math.PI / 2) * perp;
              const armTint = t > 0.55 ? '#cfe2ff' : t > 0.3 ? '#e8f0ff' : '#ffe6b8';
              const a = (1 - t * 0.5) * 0.5;
              ctx.fillStyle = hexToRgba(armTint, a);
              ctx.beginPath();
              ctx.arc(px, py, 0.55, 0, Math.PI * 2);
              ctx.fill();
            }
            // a couple HII glow spots
            for (let h = 0; h < 3; h++) {
              const t = 0.3 + Math.random() * 0.6;
              const radius = Math.pow(t, 0.75) * mg.size;
              const twist = armOffset + t * mg.tightness + (Math.random() - 0.5) * 0.4;
              const px = Math.cos(twist) * radius;
              const py = Math.sin(twist) * radius;
              const hr = mg.size * 0.13;
              const hii = ctx.createRadialGradient(px, py, 0, px, py, hr);
              const tint = Math.random() > 0.5 ? '#ff9ec8' : '#9ec8ff';
              hii.addColorStop(0, hexToRgba(tint, 0.55));
              hii.addColorStop(1, hexToRgba(tint, 0));
              ctx.fillStyle = hii;
              ctx.beginPath();
              ctx.arc(px, py, hr, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          if (mg.kind === 'barred') {
            ctx.fillStyle = hexToRgba('#ffd9a8', 0.4);
            ctx.beginPath();
            ctx.ellipse(0, 0, mg.size * 0.5, mg.size * 0.12, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // bloomy nucleus
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, mg.size * 0.28);
        core.addColorStop(0, 'rgba(255,255,255,0.85)');
        core.addColorStop(0.35, 'rgba(255,236,200,0.45)');
        core.addColorStop(1, hexToRgba(mg.tint, 0));
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, mg.size * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.8, mg.size * 0.05), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
      ctx.restore();

      // ===== asteroids (free-drifting outer rocks) =====
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (const a of asteroids) {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot + tSec * 0.05);
        ctx.fillStyle = `rgba(180,170,160,${a.alpha})`;
        ctx.beginPath();
        // jagged silhouette: 6-7 vertices with seeded jitter
        const verts = 6;
        for (let v = 0; v < verts; v++) {
          const ang = (v / verts) * Math.PI * 2;
          const wob = 0.7 + 0.3 * Math.sin(a.shape + v * 1.7);
          const px = Math.cos(ang) * a.size * wob;
          const py = Math.sin(ang) * a.size * wob;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // ===== asteroid belts (dense rings of small rocks) =====
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (const belt of asteroidBelts) {
        for (const rock of belt.rocks) {
          const ang = rock.angle + tSec * 0.008;
          const x = belt.cx + Math.cos(ang) * rock.rad;
          const y = belt.cy + Math.sin(ang) * rock.rad;
          ctx.fillStyle = `rgba(170,160,150,${rock.alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, rock.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // ===== planets =====
      ctx.save();
      for (const p of planets) {
        // soft glow halo
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
        halo.addColorStop(0, hexToRgba(p.tint, 0.12 * p.glow));
        halo.addColorStop(1, hexToRgba(p.tint, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2);
        ctx.fill();

        // planet body with shaded gradient
        const body = ctx.createRadialGradient(
          p.x - p.radius * 0.4,
          p.y - p.radius * 0.4,
          0,
          p.x,
          p.y,
          p.radius
        );
        body.addColorStop(0, hexToRgba(p.tint, 0.5));
        body.addColorStop(0.7, hexToRgba(p.tint, 0.32));
        body.addColorStop(1, hexToRgba(p.tint, 0.1));
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        if (p.ring) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ringTilt);
          ctx.strokeStyle = hexToRgba(p.ringTint, 0.28);
          ctx.lineWidth = 0.7 / currentTransform.k;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.radius * 2.2, p.radius * 0.7, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = hexToRgba(p.ringTint, 0.15);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.radius * 2.6, p.radius * 0.82, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();

      // ===== black holes =====
      ctx.save();
      for (const bh of blackHoles) {
        const spin = bh.rot + tSec * bh.spinSpeed;
        // accretion disk glow
        ctx.globalCompositeOperation = 'lighter';
        for (let ring = 0; ring < 3; ring++) {
          const rr = bh.radius * (1.8 + ring * 0.4);
          const gg = ctx.createRadialGradient(bh.x, bh.y, bh.radius * 0.8, bh.x, bh.y, rr);
          gg.addColorStop(0, 'rgba(255,180,80,0.28)');
          gg.addColorStop(0.6, 'rgba(220,120,200,0.12)');
          gg.addColorStop(1, 'rgba(160,100,220,0)');
          ctx.save();
          ctx.translate(bh.x, bh.y);
          ctx.rotate(spin + ring * 0.8);
          ctx.fillStyle = gg;
          ctx.beginPath();
          ctx.ellipse(0, 0, rr, rr * 0.4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        // event horizon (dark)
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2);
        ctx.fill();
        // rim
        ctx.strokeStyle = 'rgba(255,200,120,0.25)';
        ctx.lineWidth = 0.8 / currentTransform.k;
        ctx.stroke();
      }
      ctx.restore();

      // ===== comets =====
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const c of comets) {
        c.theta += c.speed * 0.016;
        const cs = Math.cos(c.tilt);
        const sn = Math.sin(c.tilt);
        const ox = Math.cos(c.theta) * c.a;
        const oy = Math.sin(c.theta) * c.b;
        const cx = c.orbitCx + ox * cs - oy * sn;
        const cy = c.orbitCy + ox * sn + oy * cs;
        // tail direction: tangent
        const tx = -Math.sin(c.theta) * c.a * cs - Math.cos(c.theta) * c.b * sn;
        const ty = -Math.sin(c.theta) * c.a * sn + Math.cos(c.theta) * c.b * cs;
        const len = Math.hypot(tx, ty) || 1;
        const ux = tx / len;
        const uy = ty / len;
        const tailLen = 55;
        const bx = cx - ux * tailLen;
        const by = cy - uy * tailLen;
        const grad = ctx.createLinearGradient(bx, by, cx, cy);
        grad.addColorStop(0, hexToRgba(c.tint, 0));
        grad.addColorStop(1, hexToRgba(c.tint, 0.75));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4 / currentTransform.k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        // head
        ctx.fillStyle = hexToRgba(c.tint, 0.95);
        ctx.beginPath();
        ctx.arc(cx, cy, 1.4 / Math.max(currentTransform.k, 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ===== dust motes =====
      ctx.save();
      for (const d of dustMotes) {
        ctx.fillStyle = `rgba(220,220,240,${d.alpha})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size / Math.max(currentTransform.k, 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ===== twinkle stars =====
      ctx.save();
      for (const s of twinkleStars) {
        const tw = 0.5 + 0.5 * Math.sin(s.phase + tSec * s.speed);
        const a = s.baseAlpha * tw;
        const sz = s.size / Math.max(currentTransform.k, 0.5);
        ctx.fillStyle = s.tint === '#ffffff' ? `rgba(255,255,255,${a})` : hexToRgba(s.tint, a);
        ctx.beginPath();
        ctx.arc(s.x, s.y, sz, 0, Math.PI * 2);
        ctx.fill();
        if (s.hasCross && a > 0.5) {
          ctx.strokeStyle = hexToRgba(s.tint, a * 0.55);
          ctx.lineWidth = 0.4 / currentTransform.k;
          const cl = sz * 3.5;
          ctx.beginPath();
          ctx.moveTo(s.x - cl, s.y);
          ctx.lineTo(s.x + cl, s.y);
          ctx.moveTo(s.x, s.y - cl);
          ctx.lineTo(s.x, s.y + cl);
          ctx.stroke();
        }
      }
      ctx.restore();

      // ===== constellations =====
      ctx.save();
      for (const con of constellations) {
        const tw = 0.7 + 0.3 * Math.sin(con.phase + tSec * 0.6);
        ctx.strokeStyle = `rgba(255,255,255,${con.alpha * tw})`;
        ctx.lineWidth = 0.35 / currentTransform.k;
        ctx.beginPath();
        for (let i = 0; i < con.points.length; i++) {
          const p = con.points[i];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.restore();

      // ===== shooting stars =====
      for (const ss of shootingStars) {
        const t = ss.life / ss.maxLife;
        const fade = 1 - t;
        const trailLen = 120;
        const tx = ss.x - ss.vx * trailLen * 0.35;
        const ty = ss.y - ss.vy * trailLen * 0.35;
        const grad = ctx.createLinearGradient(tx, ty, ss.x, ss.y);
        grad.addColorStop(0, hexToRgba(ss.tint, 0));
        grad.addColorStop(0.6, hexToRgba(ss.tint, 0.3 * fade));
        grad.addColorStop(1, hexToRgba(ss.tint, 0.95 * fade));
        ctx.strokeStyle = grad;
        ctx.lineWidth = ss.thickness / currentTransform.k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(ss.x, ss.y);
        ctx.stroke();
        ctx.lineCap = 'butt';
        const hg = ctx.createRadialGradient(ss.x, ss.y, 0, ss.x, ss.y, 6);
        hg.addColorStop(0, hexToRgba(ss.tint, fade));
        hg.addColorStop(1, hexToRgba(ss.tint, 0));
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${fade})`;
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, 1.4 / currentTransform.k, 0, Math.PI * 2);
        ctx.fill();
      }

      // ===== astral rings =====
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5 / currentTransform.k;
      for (const r of [90, 180, 270, 360, 460, 570]) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([2 / currentTransform.k, 6 / currentTransform.k]);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.arc(0, 0, 690, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 820, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const tickRing = 460;
      const tickRot = tSec * 0.04;
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 0.6 / currentTransform.k;
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2 + tickRot;
        const tlen = i % 5 === 0 ? 10 : 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * tickRing, Math.sin(a) * tickRing);
        ctx.lineTo(Math.cos(a) * (tickRing + tlen), Math.sin(a) * (tickRing + tlen));
        ctx.stroke();
      }
      const tickRot2 = -tSec * 0.07;
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2 + tickRot2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 270, Math.sin(a) * 270);
        ctx.lineTo(Math.cos(a) * 277, Math.sin(a) * 277);
        ctx.stroke();
      }
      const reticlePulse = 0.85 + 0.15 * Math.sin(tSec * 0.9);
      ctx.fillStyle = `rgba(255,255,255,${0.08 * reticlePulse})`;
      const rLen = 6;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const cx = dx * 570;
        const cy = dy * 570;
        ctx.beginPath();
        ctx.moveTo(cx + dx * rLen, cy + dy * rLen);
        ctx.lineTo(cx - dy * rLen * 0.7, cy + dx * rLen * 0.7);
        ctx.lineTo(cx + dy * rLen * 0.7, cy - dx * rLen * 0.7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // ===== orbiters =====
      ctx.save();
      for (const o of orbiters) {
        const ox = Math.cos(o.theta) * o.radius;
        const oy = Math.sin(o.theta) * o.radius;
        const ox2 = Math.cos(o.theta - o.trail) * o.radius;
        const oy2 = Math.sin(o.theta - o.trail) * o.radius;
        const tg = ctx.createLinearGradient(ox2, oy2, ox, oy);
        tg.addColorStop(0, 'rgba(255,255,255,0)');
        tg.addColorStop(1, `rgba(255,255,255,${o.alpha})`);
        ctx.strokeStyle = tg;
        ctx.lineWidth = (o.size * 0.7) / currentTransform.k;
        ctx.beginPath();
        ctx.moveTo(ox2, oy2);
        ctx.lineTo(ox, oy);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${o.alpha})`;
        ctx.beginPath();
        ctx.arc(ox, oy, o.size / currentTransform.k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ===== me edges (you -> every person with strength > 0) =====
      // matches peer-edge scale so a strength-10 person with no peer links still reads as strong
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const n of gNodes) {
        if (n.s <= 0) continue;
        const norm = n.s / 10;
        const pulseMul = n.s >= 7 ? 0.85 + 0.15 * Math.sin(tSec * 1.4 + n.s) : 1;
        const alpha = (Math.pow(norm, 1.2) * 0.95 + 0.03) * pulseMul;
        const width = (Math.pow(norm, 1.3) * 2.7 + 0.25) / currentTransform.k;
        ctx.strokeStyle = `rgba(220,225,255,${alpha})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(n.x ?? 0, n.y ?? 0);
        ctx.stroke();
      }
      ctx.restore();

      // ===== peer edges =====
      for (const l of gLinks) {
        const s = l.strength;
        const norm = s / 10;
        const pulseMul = s >= 7 ? 0.85 + 0.15 * Math.sin(tSec * 1.4 + s) : 1;
        const alpha = (Math.pow(norm, 1.2) * 0.95 + 0.03) * pulseMul;
        const width = (Math.pow(norm, 1.3) * 2.7 + 0.25) / currentTransform.k;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = width;
        const src = l.source as SimNode;
        const tgt = l.target as SimNode;
        ctx.beginPath();
        ctx.moveTo(src.x ?? 0, src.y ?? 0);
        ctx.lineTo(tgt.x ?? 0, tgt.y ?? 0);
        ctx.stroke();
      }

      // ===== in-progress connect line (shift+drag) =====
      if (connectSource) {
        const sx = connectSource.x ?? 0;
        const sy = connectSource.y ?? 0;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(180,220,255,0.85)';
        ctx.lineWidth = 1.8 / currentTransform.k;
        ctx.setLineDash([6 / currentTransform.k, 4 / currentTransform.k]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(connectMouseW.x, connectMouseW.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const hoverTarget = hitNodeAt(
          connectMouseW.x * currentTransform.k + currentTransform.x + canvas.getBoundingClientRect().left,
          connectMouseW.y * currentTransform.k + currentTransform.y + canvas.getBoundingClientRect().top
        );
        if (hoverTarget && hoverTarget.id !== connectSource.id) {
          const tx = hoverTarget.x ?? 0;
          const ty = hoverTarget.y ?? 0;
          ctx.strokeStyle = 'rgba(180,255,220,0.9)';
          ctx.lineWidth = 1.4 / currentTransform.k;
          ctx.beginPath();
          ctx.arc(tx, ty, 14, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ===== selection rings =====
      if (selectedIds.size > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(180,220,255,0.9)';
        ctx.lineWidth = 1.6 / currentTransform.k;
        for (const n of gNodes) {
          if (!selectedIds.has(n.id)) continue;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, 16, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ===== marquee rect =====
      if (marquee) {
        ctx.save();
        const x = Math.min(marquee.sx, marquee.ex);
        const y = Math.min(marquee.sy, marquee.ey);
        const w = Math.abs(marquee.ex - marquee.sx);
        const h = Math.abs(marquee.ey - marquee.sy);
        ctx.fillStyle = 'rgba(180,220,255,0.08)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(180,220,255,0.7)';
        ctx.lineWidth = 1.2 / currentTransform.k;
        ctx.setLineDash([5 / currentTransform.k, 3 / currentTransform.k]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.restore();
      }

      // ===== cluster labels (only user-named clusters) =====
      const bucketNames = graphRef.current.bucketNames ?? {};
      for (const bg of bgOrder) {
        const st = hazeState[bg];
        if (!st || st.a < 0.05) continue;
        const label = bucketNames[bg];
        if (!label) continue;
        const count = counts[bg] || 0;
        const mainSize = 13 / currentTransform.k;
        const subSize = 9 / currentTransform.k;
        const shadowOff = 1 / currentTransform.k;
        const labelY = st.y - st.r - 14;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = Math.min(1, st.a);
        ctx.font = `600 ${mainSize}px Inter, sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillText(label, st.x + shadowOff, labelY + shadowOff);
        ctx.fillStyle = hexToRgba(bgColors[bg], 0.98);
        ctx.fillText(label, st.x, labelY);
        ctx.font = `${subSize}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillText(`${count}`, st.x + shadowOff, labelY + 15 / currentTransform.k + shadowOff);
        ctx.fillStyle = 'rgba(180,180,180,0.75)';
        ctx.fillText(`${count}`, st.x, labelY + 15 / currentTransform.k);
        ctx.globalAlpha = 1;
      }

      // ===== people nodes =====
      for (const n of gNodes) {
        const r = 5 + (n.s / 10) * 2.5;
        const tags = n.tags;
        const isStar = tags.includes('highagency');
        const x = n.x ?? 0;
        const y = n.y ?? 0;

        if (isStar) {
          const pulse = 0.75 + 0.25 * Math.sin(tSec * 2.0 + (n._starPhase || 0));
          const pulseSlow = 0.85 + 0.15 * Math.sin(tSec * 0.7 + (n._starPhase || 0));
          const traitTagsForTint = tags.filter((t) => t !== 'highagency' && t in tagColors);
          const palette = traitTagsForTint.length > 0
            ? traitTagsForTint.map((t) => tagColors[t])
            : ['#ffe8b0'];
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const wideR = r * 6 * pulseSlow;
          // each trait contributes its own tinted halo offset slightly — reads as multicolor bloom
          for (let pi = 0; pi < palette.length; pi++) {
            const tint = palette[pi];
            const ang = (pi / palette.length) * Math.PI * 2 + tSec * 0.25;
            const off = palette.length > 1 ? r * 0.8 : 0;
            const cx = x + Math.cos(ang) * off;
            const cy = y + Math.sin(ang) * off;
            const wide = ctx.createRadialGradient(cx, cy, 0, cx, cy, wideR);
            const aMul = 1 / Math.sqrt(palette.length);
            wide.addColorStop(0, hexToRgba(tint, 0.11 * aMul));
            wide.addColorStop(0.2, hexToRgba(tint, 0.07 * aMul));
            wide.addColorStop(0.55, hexToRgba(tint, 0.025 * aMul));
            wide.addColorStop(1, hexToRgba(tint, 0));
            ctx.fillStyle = wide;
            ctx.beginPath();
            ctx.arc(cx, cy, wideR, 0, Math.PI * 2);
            ctx.fill();
          }
          const midR = r * 3.2 * pulse;
          // pie-slice mid glow — each trait owns its wedge
          if (palette.length === 1) {
            const mid = ctx.createRadialGradient(x, y, 0, x, y, midR);
            mid.addColorStop(0, 'rgba(255,255,255,0.6)');
            mid.addColorStop(0.2, hexToRgba(palette[0], 0.42));
            mid.addColorStop(0.5, hexToRgba(palette[0], 0.13));
            mid.addColorStop(1, hexToRgba(palette[0], 0));
            ctx.fillStyle = mid;
            ctx.beginPath();
            ctx.arc(x, y, midR, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const step = (Math.PI * 2) / palette.length;
            const rot = tSec * 0.18 + (n._starPhase || 0);
            for (let pi = 0; pi < palette.length; pi++) {
              const tint = palette[pi];
              const a0 = rot + pi * step;
              const a1 = a0 + step;
              const mid = ctx.createRadialGradient(x, y, 0, x, y, midR);
              mid.addColorStop(0, 'rgba(255,255,255,0.55)');
              mid.addColorStop(0.2, hexToRgba(tint, 0.45));
              mid.addColorStop(0.55, hexToRgba(tint, 0.16));
              mid.addColorStop(1, hexToRgba(tint, 0));
              ctx.fillStyle = mid;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.arc(x, y, midR, a0, a1);
              ctx.closePath();
              ctx.fill();
            }
          }
          const spikeLen = r * 5.5 * pulse;
          const spikeW = 0.6 / currentTransform.k;
          // each spike gets a different trait color when multi-tag
          const spikeTint = (i: number) => palette[i % palette.length];
          const spikeGrad = (x1: number, y1: number, x2: number, y2: number, i: number) => {
            const g = ctx.createLinearGradient(x1, y1, x2, y2);
            const tint = spikeTint(i);
            g.addColorStop(0, hexToRgba(tint, 0));
            g.addColorStop(0.5, hexToRgba(tint, 0.55));
            g.addColorStop(1, hexToRgba(tint, 0));
            return g;
          };
          ctx.lineWidth = spikeW;
          ctx.strokeStyle = spikeGrad(x - spikeLen, y, x + spikeLen, y, 0);
          ctx.beginPath();
          ctx.moveTo(x - spikeLen, y);
          ctx.lineTo(x + spikeLen, y);
          ctx.stroke();
          ctx.strokeStyle = spikeGrad(x, y - spikeLen, x, y + spikeLen, 1);
          ctx.beginPath();
          ctx.moveTo(x, y - spikeLen);
          ctx.lineTo(x, y + spikeLen);
          ctx.stroke();
          const diagLen = spikeLen * 0.6;
          const dOff = diagLen / Math.sqrt(2);
          ctx.lineWidth = spikeW * 0.7;
          ctx.strokeStyle = spikeGrad(x - dOff, y - dOff, x + dOff, y + dOff, 2);
          ctx.beginPath();
          ctx.moveTo(x - dOff, y - dOff);
          ctx.lineTo(x + dOff, y + dOff);
          ctx.stroke();
          ctx.strokeStyle = spikeGrad(x - dOff, y + dOff, x + dOff, y - dOff, 3);
          ctx.beginPath();
          ctx.moveTo(x - dOff, y + dOff);
          ctx.lineTo(x + dOff, y - dOff);
          ctx.stroke();
          ctx.restore();
          // ===== orbital rings =====
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const phase = n._starPhase || 0;
          const ringR1 = r * 2.4;
          const ringR2 = r * 3.2;
          const ring1A = 0.13 + 0.05 * Math.sin(tSec * 1.1 + phase);
          const ring2A = 0.08 + 0.04 * Math.sin(tSec * 0.6 + phase + 1.2);
          ctx.strokeStyle = `rgba(255,240,200,${ring1A})`;
          ctx.lineWidth = 0.7 / currentTransform.k;
          ctx.beginPath();
          ctx.ellipse(x, y, ringR1, ringR1 * 0.36, phase * 0.3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = `rgba(200,220,255,${ring2A})`;
          ctx.lineWidth = 0.55 / currentTransform.k;
          ctx.beginPath();
          ctx.ellipse(x, y, ringR2, ringR2 * 0.3, -phase * 0.25 + 0.8, 0, Math.PI * 2);
          ctx.stroke();
          // orbiting satellite dots on the first ring
          const sat1Ang = tSec * 0.9 + phase;
          const sat2Ang = tSec * 0.9 + phase + Math.PI;
          const satPos = (ang: number) => {
            const cos = Math.cos(phase * 0.3);
            const sin = Math.sin(phase * 0.3);
            const lx = Math.cos(ang) * ringR1;
            const ly = Math.sin(ang) * ringR1 * 0.36;
            return { x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos };
          };
          const sats = [satPos(sat1Ang), satPos(sat2Ang)];
          ctx.fillStyle = 'rgba(255,245,220,0.75)';
          for (const s of sats) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, 0.9 / currentTransform.k, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          const coreR = r * 1.1;
          const coreTint = palette[0];
          const core = ctx.createRadialGradient(x, y, 0, x, y, coreR);
          core.addColorStop(0, '#ffffff');
          core.addColorStop(0.4, '#ffffff');
          core.addColorStop(0.75, hexToRgba(coreTint, 0.95));
          core.addColorStop(1, hexToRgba(coreTint, 0.6));
          ctx.fillStyle = core;
          ctx.beginPath();
          ctx.arc(x, y, coreR, 0, Math.PI * 2);
          ctx.fill();
          // trait ring: shows character trait underneath the agency halo
          const traitTags = tags.filter((t) => t !== 'highagency' && t in tagColors);
          if (traitTags.length > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = hexToRgba(tagColors[traitTags[0]], 0.95);
            ctx.lineWidth = 1.5 / currentTransform.k;
            ctx.beginPath();
            ctx.arc(x, y, r * 1.55, 0, Math.PI * 2);
            ctx.stroke();
            if (traitTags.length > 1) {
              ctx.strokeStyle = hexToRgba(tagColors[traitTags[1]], 0.55);
              ctx.lineWidth = 0.8 / currentTransform.k;
              ctx.beginPath();
              ctx.arc(x, y, r * 1.95, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.restore();
          }
        } else {
          const knownTags = tags.filter((t) => t in tagColors);
          const palette = knownTags.length > 0 ? knownTags : [n.primary || 'friends'];
          if (palette.length === 1) {
            ctx.fillStyle = tagColors[palette[0]] ?? bgColors[n.bg] ?? '#999';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const step = (Math.PI * 2) / palette.length;
            for (let i = 0; i < palette.length; i++) {
              ctx.fillStyle = tagColors[palette[i]];
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.arc(x, y, r, -Math.PI / 2 + i * step, -Math.PI / 2 + (i + 1) * step);
              ctx.closePath();
              ctx.fill();
            }
          }
        }

        // ===== name label =====
        // for stars: bright white, bigger, below the glow, with dark stroke for contrast
        // for regulars: gray, smaller, close to node
        const firstName = n.name.split(' ')[0];
        if (isStar) {
          const traitForLabel = tags.filter((t) => t !== 'highagency' && t in tagColors);
          const labelTint = traitForLabel.length > 0 ? tagColors[traitForLabel[0]] : '#fff5d8';
          const fs = 12 / currentTransform.k;
          const ly = y + r * 6.2;
          ctx.font = `600 ${fs}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 3 / currentTransform.k;
          ctx.strokeStyle = 'rgba(0,0,0,0.9)';
          ctx.strokeText(firstName, x, ly);
          ctx.fillStyle = hexToRgba(labelTint, 0.98);
          ctx.fillText(firstName, x, ly);
        } else {
          const fs = 10 / currentTransform.k;
          const ly = y - r - 6 / currentTransform.k;
          ctx.font = `500 ${fs}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 2.5 / currentTransform.k;
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.strokeText(firstName, x, ly);
          const alpha = n.s === 0 ? 0.7 : Math.min(0.95, 0.55 + n.s * 0.045);
          ctx.fillStyle = `rgba(210,210,215,${alpha})`;
          ctx.fillText(firstName, x, ly);
        }
      }

      // ===== "you" node =====
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 / currentTransform.k;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([1 / currentTransform.k, 3 / currentTransform.k]);
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ededed';
      const youFont = 11 / currentTransform.k;
      ctx.font = `${youFont}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('you', 0, 46);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      sim.stop();
      ro.disconnect();
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('pointerdown', onPointerDown, true);
      canvas.removeEventListener('pointermove', onPointerMove, true);
      canvas.removeEventListener('pointerup', onPointerUp, true);
      canvas.removeEventListener('pointercancel', onPointerUp, true);
      runtimeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // data effect: apply graph changes incrementally
  useEffect(() => {
    runtimeRef.current?.applyGraph(graph);
  }, [graph]);

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <canvas ref={canvasRef} id="graph-canvas" />
    </div>
  );
}

export { tagColors, bgLabels, bgSubtitle, bgColors, bgOrder };
