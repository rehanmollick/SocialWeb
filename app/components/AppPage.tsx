'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GraphCanvas, {
  tagColors,
  bgColors,
  type GraphNode,
  type GraphPayload,
  type EdgeSelection,
  type RopeSelection,
  type ClusterEdgeSelection,
} from '../canvas';

const TAG_KEYS = ['highagency', 'highsignal', 'interesting', 'fun', 'friends', 'important', 'helpful', 'boring'] as const;
const BG_KEYS = ['plano', 'ut', 'allen', 'sf', 'family', 'climb', 'online'] as const;
import Sidebar from './Sidebar';
import MemoryPanel from './MemoryPanel';

type AppPageProps = {
  onLeaveToLanding?: () => void;
};

export default function AppPage({ onLeaveToLanding }: AppPageProps) {
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], edges: [] });
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<EdgeSelection | null>(null);
  const [selectedRope, setSelectedRope] = useState<RopeSelection | null>(null);
  const [selectedClusterEdge, setSelectedClusterEdge] = useState<ClusterEdgeSelection | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const cmdInputRef = useRef<HTMLTextAreaElement>(null);
  const cmdLastAutoH = useRef(0);
  const cmdUserResized = useRef(false);
  const [busy, setBusy] = useState(false);
  const [cmdStatus, setCmdStatus] = useState('');
  const [thoughtsRefreshKey, setThoughtsRefreshKey] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [connectQuery, setConnectQuery] = useState('');
  const [connectStrength, setConnectStrength] = useState(3);
  const [clusterNamePopup, setClusterNamePopup] = useState<{
    bg: string;
    x: number;
    y: number;
    value: string;
    memberIds: number[];
  } | null>(null);
  const [createPopup, setCreatePopup] = useState<{
    x: number;
    y: number;
    wx: number;
    wy: number;
    bg: string;
    name: string;
    description: string;
    tags: string[];
  } | null>(null);
  const [descDraft, setDescDraft] = useState<string>('');

  const fetchGraph = useCallback(async () => {
    const res = await fetch('/api/graph', { cache: 'no-store' });
    const data = (await res.json()) as GraphPayload;
    setGraph(data);
    setSelected((prev) => (prev ? data.nodes.find((n) => n.id === prev.id) ?? null : null));
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  useEffect(() => {
    if (cmdUserResized.current) return;
    const el = cmdInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(el.scrollHeight, window.innerHeight * 0.6);
    el.style.height = `${h}px`;
    cmdLastAutoH.current = h;
  }, [input]);

  useEffect(() => {
    const el = cmdInputRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      if (Math.abs(h - cmdLastAutoH.current) > 2) {
        cmdUserResized.current = true;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        setSelectedEdge(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = async () => {
    const body = input.trim();
    if (!body || busy) return;
    setBusy(true);
    setCmdStatus('');
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as { summary?: string };
      setInput('');
      setCmdStatus(data.summary ?? '');
      await fetchGraph();
      setThoughtsRefreshKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  const pickPerson = (n: GraphNode) => {
    setSelected(n);
    setSelectedEdge(null);
    setFocusId(n.id);
    setConnecting(false);
    setConnectQuery('');
    setConnectStrength(3);
    setDescDraft(n.description ?? '');
  };

  const pickEdge = (e: EdgeSelection | null) => {
    setSelectedEdge(e);
    if (e) setSelected(null);
  };

  const patchStrength = async (id: number, strength: number) => {
    setSelected((prev) => (prev && prev.id === id ? { ...prev, strength } : prev));
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, strength } : n)) }));
    await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ strength }),
    });
  };

  const toggleTag = async (id: number, tag: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) return;
    const nextTags = node.tags.includes(tag)
      ? node.tags.filter((t) => t !== tag)
      : [...node.tags, tag];
    setSelected((prev) => (prev && prev.id === id ? { ...prev, tags: nextTags } : prev));
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, tags: nextTags } : n)),
    }));
    await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: nextTags }),
    });
  };

  const patchBg = async (id: number, bg: string) => {
    setSelected((prev) => (prev && prev.id === id ? { ...prev, bg } : prev));
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, bg } : n)) }));
    await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bg }),
    });
    await fetchGraph();
  };

  const togglePinToMe = async (id: number) => {
    const next = !(selected?.pinToMe ?? false);
    setSelected((prev) => (prev && prev.id === id ? { ...prev, pinToMe: next } : prev));
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, pinToMe: next } : n)),
    }));
    await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinToMe: next }),
    });
  };

  const connectTo = async (a: number, b: number, weight: number) => {
    if (a === b) return;
    await fetch('/api/edges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a, b, weight }),
    });
    setConnecting(false);
    setConnectQuery('');
    setConnectStrength(3);
    await fetchGraph();
  };

  const deletePerson = async (id: number) => {
    await fetch(`/api/people/${id}`, { method: 'DELETE' });
    setSelected(null);
    await fetchGraph();
    setThoughtsRefreshKey((k) => k + 1);
  };

  const patchEdgeWeight = async (a: number, b: number, weight: number) => {
    setSelectedEdge((prev) => (prev && prev.a === a && prev.b === b ? { ...prev, weight } : prev));
    setGraph((g) => ({
      ...g,
      edges: g.edges.map((e) =>
        (e.source === a && e.target === b) || (e.source === b && e.target === a) ? { ...e, weight } : e
      ),
    }));
    await fetch('/api/edges', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a, b, weight }),
    });
  };

  const submitClusterName = async () => {
    if (!clusterNamePopup) return;
    const { bg, value } = clusterNamePopup;
    const existing = (graph.bucketNames ?? {})[bg] ?? '';
    setClusterNamePopup(null);
    const trimmed = value.trim();
    // no-op: opened then dismissed without ever having a name
    if (!trimmed && !existing) return;
    // cleared an existing name → treat as delete
    if (!trimmed && existing) {
      await deleteClusterName(bg);
      return;
    }
    if (trimmed === existing) return;
    await fetch(`/api/buckets/${encodeURIComponent(bg)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    await fetchGraph();
  };

  const deleteClusterName = async (bg: string) => {
    setGraph((g) => {
      const next = { ...(g.bucketNames ?? {}) };
      delete next[bg];
      return { ...g, bucketNames: next };
    });
    setClusterNamePopup(null);
    await fetch(`/api/buckets/${encodeURIComponent(bg)}`, { method: 'DELETE' });
    await fetchGraph();
  };

  const dissolveCluster = async (ids: number[], bg: string) => {
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Dissolve this cluster? The ${ids.length} ${ids.length === 1 ? 'person' : 'people'} will move to the default group.`,
    );
    if (!ok) return;
    setClusterNamePopup(null);
    setSelectedRope(null);
    const idSet = new Set(ids);
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => idSet.has(n.id) ? { ...n, bg: 'online', x: null, y: null } : n),
      bucketNames: (() => { const next = { ...(g.bucketNames ?? {}) }; delete next[bg]; return next; })(),
    }));
    await Promise.all([
      // move each person to 'online' and clear their saved position
      ...ids.map((id) =>
        fetch(`/api/people/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bg: 'online', clearPosition: true }),
        }),
      ),
      // delete the bucket name + rope metadata
      fetch(`/api/buckets/${encodeURIComponent(bg)}`, { method: 'DELETE' }),
    ]);
    await fetchGraph();
  };

  const deleteWholeCluster = async (ids: number[]) => {
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Permanently delete ${ids.length} ${ids.length === 1 ? 'person' : 'people'}? This can't be undone.`,
    );
    if (!ok) return;
    setClusterNamePopup(null);
    const idSet = new Set(ids);
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.filter((n) => !idSet.has(n.id)),
      edges: g.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
    }));
    setSelected(null);
    setSelectedEdge(null);
    setSelectedRope(null);
    setSelectedClusterEdge(null);
    await Promise.all(ids.map((id) =>
      fetch(`/api/people/${id}`, { method: 'DELETE' }),
    ));
    await fetchGraph();
  };

  const submitCreatePopup = async () => {
    if (!createPopup) return;
    const name = createPopup.name.trim();
    if (!name) {
      setCreatePopup(null);
      return;
    }
    const body = {
      name,
      bg: createPopup.bg,
      description: createPopup.description,
      tags: createPopup.tags,
      strength: 5,
      x: createPopup.wx,
      y: createPopup.wy,
    };
    setCreatePopup(null);
    await fetch('/api/people', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await fetchGraph();
  };

  const saveDescription = async (id: number, description: string) => {
    setSelected((prev) => (prev && prev.id === id ? { ...prev, description } : prev));
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, description } : n)),
    }));
    await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description }),
    });
  };

  const handleConnect = async (a: number, b: number) => {
    if (a === b) return;
    await fetch('/api/edges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a, b, weight: 3 }),
    });
    setCmdStatus('connected');
    await fetchGraph();
  };

  const deleteEdge = async (a: number, b: number) => {
    await fetch('/api/edges', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a, b }),
    });
    setSelectedEdge(null);
    await fetchGraph();
  };

  const pinToMeById = async (id: number) => {
    const target = graph.nodes.find((n) => n.id === id);
    if (!target) return;
    const next = !target.pinToMe;
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, pinToMe: next } : n)),
    }));
    await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinToMe: next }),
    });
  };

  const patchRope = async (bg: string, patch: { meWeight?: number | null; meHidden?: boolean }) => {
    setGraph((g) => {
      const next = { ...(g.bucketRopes ?? {}) };
      const existing = next[bg] ?? { weight: null, hidden: false };
      next[bg] = {
        weight: 'meWeight' in patch ? (patch.meWeight ?? null) : existing.weight,
        hidden: 'meHidden' in patch ? !!patch.meHidden : existing.hidden,
      };
      return { ...g, bucketRopes: next };
    });
    await fetch(`/api/buckets/${bg}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
  };

  const hideRope = async (bg: string) => {
    await patchRope(bg, { meHidden: true });
    setSelectedRope(null);
  };

  const orderPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

  const handleConnectClusters = async (bgA: string, bgB: string) => {
    if (bgA === bgB) return;
    const [a, b] = orderPair(bgA, bgB);
    setGraph((g) => {
      const list = [...(g.clusterEdges ?? [])];
      const existing = list.find((e) => e.a === a && e.b === b);
      if (existing) existing.weight = 5;
      else list.push({ a, b, weight: 5 });
      return { ...g, clusterEdges: list };
    });
    await fetch('/api/cluster-edges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bgA: a, bgB: b, weight: 5 }),
    });
  };

  const patchClusterEdge = async (bgA: string, bgB: string, weight: number) => {
    const [a, b] = orderPair(bgA, bgB);
    const w = Math.max(0, Math.min(10, weight));
    setGraph((g) => {
      const list = (g.clusterEdges ?? []).map((e) =>
        e.a === a && e.b === b ? { ...e, weight: w } : e
      );
      return { ...g, clusterEdges: list };
    });
    setSelectedClusterEdge((sel) =>
      sel && sel.a === a && sel.b === b ? { ...sel, weight: w } : sel
    );
    await fetch('/api/cluster-edges', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bgA: a, bgB: b, weight: w }),
    });
  };

  const deleteClusterEdge = async (bgA: string, bgB: string) => {
    const [a, b] = orderPair(bgA, bgB);
    setGraph((g) => ({
      ...g,
      clusterEdges: (g.clusterEdges ?? []).filter((e) => !(e.a === a && e.b === b)),
    }));
    setSelectedClusterEdge(null);
    await fetch('/api/cluster-edges', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bgA: a, bgB: b }),
    });
  };

  const customNames = graph.bucketNames ?? {};
  // only custom names — presets intentionally empty so clusters stay unnamed until the user names them.
  const labelFor = (bg: string) => customNames[bg] ?? '';

  const cls = ['app'];
  if (leftCollapsed) cls.push('left-collapsed');
  if (rightCollapsed) cls.push('right-collapsed');

  const edgePeopleA = selectedEdge ? graph.nodes.find((n) => n.id === selectedEdge.a) : null;
  const edgePeopleB = selectedEdge ? graph.nodes.find((n) => n.id === selectedEdge.b) : null;

  const ropeBucketMembers = selectedRope
    ? graph.nodes.filter((n) => selectedRope.memberIds.includes(n.id))
    : [];
  const ropeAvgS =
    ropeBucketMembers.length > 0
      ? ropeBucketMembers.reduce((s, n) => s + n.strength, 0) / ropeBucketMembers.length
      : 5;
  const ropeOverride =
    selectedRope && graph.bucketRopes
      ? graph.bucketRopes[selectedRope.bg] ?? graph.bucketRopes[selectedRope.baseBg]
      : undefined;
  const ropeDisplayWeight = ropeOverride?.weight ?? ropeAvgS;
  const ropeLabel =
    selectedRope && (customNames[selectedRope.baseBg] || selectedRope.baseBg);

  return (
    <div className={cls.join(' ')}>
      <Sidebar
        nodes={graph.nodes}
        selectedId={selected?.id ?? null}
        onSelect={pickPerson}
        collapsed={leftCollapsed}
        onToggle={() => setLeftCollapsed((v) => !v)}
        bucketNames={customNames}
      />

      <div className="canvas">
        <div className="canvas-chrome">
          <div className="crumbs">
            graph · <b>{graph.nodes.length}</b> people · <b>{graph.edges.length}</b> edges
          </div>
          <div className="chrome-actions">
            <button
              className="chrome-btn"
              onClick={async () => {
                const res = await fetch('/api/snapshot');
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                a.download = `socialweb-snapshot-${stamp}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              }}
              title="download a JSON snapshot of the whole graph"
            >
              export
            </button>
            <button
              className="chrome-btn"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'application/json,.json';
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  if (
                    !confirm(
                      'this will WIPE the current graph and replace it with the snapshot. continue?',
                    )
                  )
                    return;
                  const text = await file.text();
                  const res = await fetch('/api/snapshot', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: text,
                  });
                  if (!res.ok) {
                    alert('import failed');
                    return;
                  }
                  await fetchGraph();
                };
                input.click();
              }}
              title="restore a graph from a previously exported JSON snapshot"
            >
              import
            </button>
          </div>
        </div>

        <GraphCanvas
          graph={graph}
          onSelect={(n) => {
            setSelected(n);
            if (n) {
              setSelectedEdge(null);
              setDescDraft(n.description ?? '');
            }
            setConnecting(false);
            setConnectQuery('');
          }}
          onSelectEdge={pickEdge}
          onSelectRope={(r) => {
            setSelectedRope(r);
            if (r) {
              setSelected(null);
              setSelectedEdge(null);
              setSelectedClusterEdge(null);
            }
          }}
          onSelectClusterEdge={(ce) => {
            setSelectedClusterEdge(ce);
            if (ce) {
              setSelected(null);
              setSelectedEdge(null);
              setSelectedRope(null);
            }
          }}
          onConnectClusters={handleConnectClusters}
          onChangeBg={async (id, newBg) => {
            setGraph((g) => ({
              ...g,
              nodes: g.nodes.map((n) => (n.id === id ? { ...n, bg: newBg } : n)),
            }));
            setSelected((prev) => (prev && prev.id === id ? { ...prev, bg: newBg } : prev));
            await fetch(`/api/people/${id}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ bg: newBg }),
            });
          }}
          onSavePositions={async (points) => {
            setGraph((g) => {
              const map = new Map(points.map((p) => [p.id, p]));
              return {
                ...g,
                nodes: g.nodes.map((n) => {
                  const p = map.get(n.id);
                  if (!p) return n;
                  return { ...n, x: p.x, y: p.y };
                }),
              };
            });
            await fetch('/api/people/positions', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ positions: points }),
            });
          }}
          onClusterClick={(bg, sx, sy, memberIds) => {
            const baseBg = bg.split('#')[0];
            const existing = (graph.bucketNames ?? {})[baseBg] ?? '';
            setClusterNamePopup({ bg: baseBg, x: sx, y: sy, value: existing, memberIds });
          }}
          onConnect={handleConnect}
          onPinToMe={pinToMeById}
          onCreateAt={(sx, sy, wx, wy, bg) => {
            setCreatePopup({ x: sx, y: sy, wx, wy, bg, name: '', description: '', tags: [] });
          }}
          onMoveGroup={() => {}}
          focusId={focusId}
        />

        <div className="strength-key">
          <span className="title">strength</span>
          <div className="srow">
            <i style={{ height: 2 }} />
            <span>weak</span>
          </div>
          <div className="srow">
            <i style={{ height: 3 }} />
            <span>warm</span>
          </div>
          <div className="srow">
            <i style={{ height: 4 }} />
            <span>strong</span>
          </div>
        </div>

        <div className="controls-hud">
          <span className="title">controls</span>
          <div className="crow"><kbd>click</kbd><span>select dot</span></div>
          <div className="crow"><kbd>drag</kbd><span>move dot</span></div>
          <div className="crow"><kbd>⇧</kbd>+<kbd>drag</kbd><span>connect 2 dots</span></div>
          <div className="crow"><kbd>⌥</kbd>+<kbd>click</kbd><span>new dot</span></div>
          <div className="crow"><kbd>⌘</kbd>+<kbd>drag</kbd><span>box select</span></div>
          <div className="crow"><kbd>wheel</kbd>/<kbd>pinch</kbd><span>zoom</span></div>
          <div className="crow"><kbd>click</kbd><span>haze → name cluster</span></div>
        </div>


        {createPopup && (
          <div
            className="create-popup"
            style={{ left: createPopup.x, top: createPopup.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cp-head">
              new person
              {labelFor(createPopup.bg) && ` · ${labelFor(createPopup.bg)}`}
            </div>
            <input
              autoFocus
              placeholder="name"
              value={createPopup.name}
              onChange={(e) =>
                setCreatePopup((p) => (p ? { ...p, name: e.target.value } : p))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreatePopup();
                if (e.key === 'Escape') setCreatePopup(null);
              }}
            />
            <textarea
              placeholder="description (optional)"
              value={createPopup.description}
              rows={2}
              onChange={(e) =>
                setCreatePopup((p) => (p ? { ...p, description: e.target.value } : p))
              }
            />
            <div className="cp-bg">
              {BG_KEYS.map((bg) => (
                <span
                  key={bg}
                  className="dd-tag"
                  onClick={() =>
                    setCreatePopup((p) => (p ? { ...p, bg } : p))
                  }
                  style={{
                    cursor: 'pointer',
                    opacity: createPopup.bg === bg ? 1 : 0.35,
                    borderColor: createPopup.bg === bg ? bgColors[bg] : 'transparent',
                  }}
                >
                  <i style={{ background: bgColors[bg] ?? '#8fc08f' }} />
                  {labelFor(bg) || <span className="dd-tag-unnamed">cluster</span>}
                </span>
              ))}
            </div>
            <div className="cp-tags">
              {TAG_KEYS.map((t) => {
                const active = createPopup.tags.includes(t);
                return (
                  <span
                    key={t}
                    className="dd-tag"
                    onClick={() =>
                      setCreatePopup((p) =>
                        p
                          ? {
                              ...p,
                              tags: active ? p.tags.filter((x) => x !== t) : [...p.tags, t],
                            }
                          : p
                      )
                    }
                    style={{
                      cursor: 'pointer',
                      opacity: active ? 1 : 0.35,
                      borderColor: active ? tagColors[t] : 'transparent',
                    }}
                  >
                    <i style={{ background: tagColors[t] ?? '#8fc08f' }} />
                    {t}
                  </span>
                );
              })}
            </div>
            <div className="cp-actions">
              <button onClick={() => setCreatePopup(null)}>cancel</button>
              <button className="cp-create" onClick={submitCreatePopup}>
                create
              </button>
            </div>
          </div>
        )}

        {clusterNamePopup && (() => {
          const popBg = clusterNamePopup.bg;
          const ropeInfo = (graph.bucketRopes ?? {})[popBg];
          const ropeWeight = ropeInfo?.weight ?? 5;
          const existingEdges = (graph.clusterEdges ?? []).filter(
            (e) => e.a === popBg || e.b === popBg,
          );
          // other clusters to connect to
          const otherClusters: { bg: string; label: string }[] = [];
          const seenBg = new Set<string>();
          for (const n of graph.nodes) {
            if (n.bg === popBg || seenBg.has(n.bg)) continue;
            seenBg.add(n.bg);
            const name = (graph.bucketNames ?? {})[n.bg];
            otherClusters.push({ bg: n.bg, label: name || n.bg.slice(0, 8) });
          }
          const alreadyLinked = new Set(existingEdges.map((e) => e.a === popBg ? e.b : e.a));
          const linkable = otherClusters.filter((c) => !alreadyLinked.has(c.bg));

          return (
            <div
              className="cluster-name-popup"
              style={{ left: clusterNamePopup.x, top: clusterNamePopup.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                placeholder="name this cluster..."
                value={clusterNamePopup.value}
                onChange={(e) =>
                  setClusterNamePopup((p) => (p ? { ...p, value: e.target.value } : p))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitClusterName();
                  if (e.key === 'Escape') setClusterNamePopup(null);
                }}
                onBlur={submitClusterName}
              />

              {/* rope strength slider */}
              <div className="cluster-popup-section">
                <label className="cluster-popup-label">connection strength</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={ropeWeight}
                    onChange={async (e) => {
                      const w = Number(e.target.value);
                      setGraph((g) => ({
                        ...g,
                        bucketRopes: { ...(g.bucketRopes ?? {}), [popBg]: { weight: w, hidden: false } },
                      }));
                      await fetch(`/api/buckets/${encodeURIComponent(popBg)}`, {
                        method: 'PATCH',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ meWeight: w }),
                      });
                    }}
                    style={{ flex: 1 }}
                  />
                  <span className="cluster-popup-value">{ropeWeight}</span>
                </div>
              </div>

              {/* cluster-to-cluster connections */}
              <div className="cluster-popup-section">
                <label className="cluster-popup-label">linked clusters</label>
                {existingEdges.map((edge) => {
                  const other = edge.a === popBg ? edge.b : edge.a;
                  const otherName = (graph.bucketNames ?? {})[other] || other.slice(0, 8);
                  return (
                    <div key={other} className="cluster-link-row">
                      <span className="cluster-link-name">{otherName}</span>
                      <span className="cluster-popup-value">{edge.weight}</span>
                      <button
                        className="cluster-link-remove"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={async () => {
                          setGraph((g) => ({
                            ...g,
                            clusterEdges: (g.clusterEdges ?? []).filter(
                              (ce) => !((ce.a === popBg && ce.b === other) || (ce.a === other && ce.b === popBg)),
                            ),
                          }));
                          await fetch('/api/cluster-edges', {
                            method: 'DELETE',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ bgA: popBg, bgB: other }),
                          });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {existingEdges.length === 0 && (
                  <div className="cluster-popup-hint">only connected to you</div>
                )}
                {linkable.length > 0 && (
                  <select
                    className="cluster-link-select"
                    value=""
                    onChange={async (e) => {
                      const targetBg = e.target.value;
                      if (!targetBg) return;
                      const newEdge = { a: popBg < targetBg ? popBg : targetBg, b: popBg < targetBg ? targetBg : popBg, weight: 5 };
                      setGraph((g) => ({
                        ...g,
                        clusterEdges: [...(g.clusterEdges ?? []), newEdge],
                      }));
                      await fetch('/api/cluster-edges', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ bgA: popBg, bgB: targetBg, weight: 5 }),
                      });
                    }}
                  >
                    <option value="">+ link to cluster...</option>
                    {linkable.map((c) => (
                      <option key={c.bg} value={c.bg}>{c.label}</option>
                    ))}
                  </select>
                )}
              </div>

              {(graph.bucketNames ?? {})[popBg] && (
                <button
                  className="cluster-name-delete"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => deleteClusterName(popBg)}
                >
                  clear name
                </button>
              )}
              <button
                className="cluster-name-delete cluster-name-wipe"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => dissolveCluster(clusterNamePopup.memberIds, popBg)}
              >
                dissolve cluster
              </button>
              <button
                className="cluster-name-delete cluster-name-wipe"
                style={{ background: '#6b2020' }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => deleteWholeCluster(clusterNamePopup.memberIds)}
              >
                delete all people
              </button>
            </div>
          );
        })()}

        {selected && (
          <div className="detail-drawer">
            <div className="dd-head">
              <div>
                <div className="dd-name">{selected.name}</div>
                {labelFor(selected.bg) && (
                  <div className="dd-sub">{labelFor(selected.bg)}</div>
                )}
              </div>
              <button className="dd-close" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <div>
              <div className="dd-section-label">description</div>
              <textarea
                className="dd-desc"
                rows={3}
                placeholder="notes about this person..."
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={() => {
                  if (descDraft !== (selected.description ?? '')) {
                    saveDescription(selected.id, descDraft);
                  }
                }}
              />
            </div>
            <div>
              <button
                className={`dd-pin${selected.pinToMe ? ' active' : ''}`}
                onClick={() => togglePinToMe(selected.id)}
              >
                {selected.pinToMe ? '★ pinned to you' : '☆ pin direct line to you'}
              </button>
            </div>
            <div>
              <div className="dd-section-label">tags · click to toggle</div>
              <div className="dd-tags">
                {TAG_KEYS.map((t) => {
                  const active = selected.tags.includes(t);
                  return (
                    <span
                      key={t}
                      className="dd-tag"
                      onClick={() => toggleTag(selected.id, t)}
                      style={{
                        cursor: 'pointer',
                        opacity: active ? 1 : 0.35,
                        borderColor: active ? tagColors[t] : 'transparent',
                      }}
                    >
                      <i style={{ background: tagColors[t] ?? '#8fc08f' }} />
                      {t}
                    </span>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="dd-section-label">cluster</div>
              <div className="dd-tags">
                {BG_KEYS.map((bg) => {
                  const active = selected.bg === bg;
                  const name = labelFor(bg);
                  return (
                    <span
                      key={bg}
                      className="dd-tag"
                      onClick={() => patchBg(selected.id, bg)}
                      style={{
                        cursor: 'pointer',
                        opacity: active ? 1 : 0.35,
                        borderColor: active ? bgColors[bg] : 'transparent',
                      }}
                    >
                      <i style={{ background: bgColors[bg] ?? '#8fc08f' }} />
                      {name || <span className="dd-tag-unnamed">unnamed</span>}
                    </span>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="dd-section-label">
                strength {selected.strength === 0 && <span className="dd-peer-badge">peer only</span>}
              </div>
              <div className="dd-strength">
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={selected.strength}
                  onChange={(e) => patchStrength(selected.id, Number(e.target.value))}
                />
                <span className="dd-strength-val">{selected.strength.toFixed(1)}</span>
              </div>
              <button
                className="dd-peer-btn"
                onClick={() => patchStrength(selected.id, selected.strength === 0 ? 5 : 0)}
              >
                {selected.strength === 0 ? 'reconnect to me' : 'make peer-only (disconnect from me)'}
              </button>
            </div>
            <div>
              <div className="dd-section-label">connections</div>
              {(() => {
                const neighbors = graph.edges
                  .map((e) => {
                    if (e.source === selected.id) return { other: e.target, weight: e.weight };
                    if (e.target === selected.id) return { other: e.source, weight: e.weight };
                    return null;
                  })
                  .filter((x): x is { other: number; weight: number } => !!x)
                  .map((x) => {
                    const n = graph.nodes.find((nn) => nn.id === x.other);
                    return n ? { node: n, weight: x.weight } : null;
                  })
                  .filter((x): x is { node: GraphNode; weight: number } => !!x)
                  .sort((a, b) => b.weight - a.weight);
                return (
                  <div className="dd-neighbors">
                    {neighbors.map(({ node: n, weight }) => (
                      <div key={n.id} className="dd-neighbor-row">
                        <span
                          className="dd-neighbor-name"
                          onClick={() => pickPerson(n)}
                          style={{ cursor: 'pointer' }}
                        >
                          <i
                            style={{
                              background:
                                tagColors[n.tags[0] ?? ''] ?? bgColors[n.bg] ?? '#8fc08f',
                            }}
                          />
                          {n.name}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={0.5}
                          value={weight}
                          onChange={(e) =>
                            patchEdgeWeight(selected.id, n.id, Number(e.target.value))
                          }
                        />
                        <span className="dd-neighbor-val">{weight.toFixed(1)}</span>
                        <button
                          className="dd-neighbor-del"
                          onClick={() => deleteEdge(selected.id, n.id)}
                          title="remove connection"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {!connecting ? (
                <button
                  className="dd-connect-btn"
                  onClick={() => setConnecting(true)}
                >
                  + connect to someone
                </button>
              ) : (
                <div className="dd-connect">
                  <input
                    autoFocus
                    placeholder="search people..."
                    value={connectQuery}
                    onChange={(e) => setConnectQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setConnecting(false);
                        setConnectQuery('');
                      }
                    }}
                  />
                  <div className="dd-connect-strength">
                    <span>strength</span>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={connectStrength}
                      onChange={(e) => setConnectStrength(Number(e.target.value))}
                    />
                    <span className="dd-neighbor-val">{connectStrength.toFixed(1)}</span>
                  </div>
                  <div className="dd-connect-list">
                    {graph.nodes
                      .filter(
                        (n) =>
                          n.id !== selected.id &&
                          (connectQuery === '' ||
                            n.name.toLowerCase().includes(connectQuery.toLowerCase()))
                      )
                      .slice(0, 6)
                      .map((n) => {
                        const already = graph.edges.some(
                          (e) =>
                            (e.source === selected.id && e.target === n.id) ||
                            (e.source === n.id && e.target === selected.id)
                        );
                        return (
                          <button
                            key={n.id}
                            className="dd-connect-row"
                            disabled={already}
                            onClick={() => connectTo(selected.id, n.id, connectStrength)}
                          >
                            <i
                              style={{
                                background:
                                  tagColors[n.tags[0] ?? ''] ?? bgColors[n.bg] ?? '#8fc08f',
                              }}
                            />
                            {n.name}
                            {already && <span className="dd-connect-meta">linked</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
            <button className="dd-delete-person" onClick={() => deletePerson(selected.id)}>
              delete person
            </button>
          </div>
        )}

        {selectedRope && (
          <div className="detail-drawer">
            <div className="dd-head">
              <div>
                <div className="dd-name">
                  you <span style={{ color: 'var(--fg-muted)' }}>→</span> {ropeLabel}
                </div>
                <div className="dd-sub">
                  cluster rope · {ropeBucketMembers.length} {ropeBucketMembers.length === 1 ? 'person' : 'people'}
                </div>
              </div>
              <button className="dd-close" onClick={() => setSelectedRope(null)}>
                ×
              </button>
            </div>
            <div>
              <div className="dd-section-label">strength</div>
              <div className="dd-strength">
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={ropeDisplayWeight}
                  onChange={(e) => patchRope(selectedRope.baseBg, { meWeight: Number(e.target.value) })}
                />
                <span className="dd-strength-val">{ropeDisplayWeight.toFixed(1)}</span>
              </div>
              {ropeOverride?.weight != null && (
                <button
                  className="dd-reset"
                  onClick={() => patchRope(selectedRope.baseBg, { meWeight: null })}
                >
                  reset to avg ({ropeAvgS.toFixed(1)})
                </button>
              )}
            </div>
            <button
              className="dd-delete-person"
              style={{ marginTop: 6 }}
              onClick={() => dissolveCluster(selectedRope.memberIds, selectedRope.baseBg)}
            >
              dissolve cluster
            </button>
            <button
              className="dd-delete-person"
              style={{ marginTop: 6, background: '#6b2020' }}
              onClick={() => deleteWholeCluster(selectedRope.memberIds)}
            >
              delete all people
            </button>
          </div>
        )}

        {selectedClusterEdge && (
          <div className="detail-drawer">
            <div className="dd-head">
              <div>
                <div className="dd-name">
                  {customNames[selectedClusterEdge.a] || selectedClusterEdge.a}{' '}
                  <span style={{ color: 'var(--fg-muted)' }}>↔</span>{' '}
                  {customNames[selectedClusterEdge.b] || selectedClusterEdge.b}
                </div>
                <div className="dd-sub">cluster connection</div>
              </div>
              <button className="dd-close" onClick={() => setSelectedClusterEdge(null)}>
                ×
              </button>
            </div>
            <div>
              <div className="dd-section-label">strength</div>
              <div className="dd-strength">
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={selectedClusterEdge.weight}
                  onChange={(e) =>
                    patchClusterEdge(
                      selectedClusterEdge.a,
                      selectedClusterEdge.b,
                      Number(e.target.value)
                    )
                  }
                />
                <span className="dd-strength-val">{selectedClusterEdge.weight.toFixed(1)}</span>
              </div>
            </div>
            <button
              className="dd-delete-person"
              onClick={() => deleteClusterEdge(selectedClusterEdge.a, selectedClusterEdge.b)}
            >
              delete cluster edge
            </button>
          </div>
        )}

        {selectedEdge && edgePeopleA && edgePeopleB && (
          <div className="detail-drawer">
            <div className="dd-head">
              <div>
                <div className="dd-name">
                  {edgePeopleA.name} <span style={{ color: 'var(--fg-muted)' }}>↔</span> {edgePeopleB.name}
                </div>
                <div className="dd-sub">connection</div>
              </div>
              <button className="dd-close" onClick={() => setSelectedEdge(null)}>
                ×
              </button>
            </div>
            <div>
              <div className="dd-section-label">strength</div>
              <div className="dd-strength">
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={selectedEdge.weight}
                  onChange={(e) => patchEdgeWeight(selectedEdge.a, selectedEdge.b, Number(e.target.value))}
                />
                <span className="dd-strength-val">{selectedEdge.weight.toFixed(1)}</span>
              </div>
            </div>
            <button className="dd-delete-person" onClick={() => deleteEdge(selectedEdge.a, selectedEdge.b)}>
              delete connection
            </button>
          </div>
        )}

        <div className="cmdbar">
          <div className="row">
            <span className="glyph">+</span>
            <textarea
              ref={cmdInputRef}
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="drop a thought or give a command... 'connect sarah and jess strongly'"
              disabled={busy}
            />
          </div>
          <div className="hints">
            <span>
              <b>↵</b> save
            </span>
            <span>
              <b>⇧↵</b> newline
            </span>
            <span>
              <b>esc</b> clear
            </span>
            <span className="meta">
              {busy ? 'thinking...' : cmdStatus || 'claude haiku · journal or give commands'}
            </span>
          </div>
        </div>
      </div>

      <MemoryPanel
        refreshKey={thoughtsRefreshKey}
        collapsed={rightCollapsed}
        onToggle={() => setRightCollapsed((v) => !v)}
      />
    </div>
  );
}
