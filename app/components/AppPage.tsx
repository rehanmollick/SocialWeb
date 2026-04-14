'use client';

import { useCallback, useEffect, useState } from 'react';
import GraphCanvas, {
  tagColors,
  bgLabels,
  bgSubtitle,
  bgColors,
  type GraphNode,
  type GraphPayload,
  type EdgeSelection,
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
  const [focusId, setFocusId] = useState<number | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [cmdStatus, setCmdStatus] = useState('');
  const [thoughtsRefreshKey, setThoughtsRefreshKey] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [connectQuery, setConnectQuery] = useState('');
  const [connectStrength, setConnectStrength] = useState(3);
  const [renamingBg, setRenamingBg] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [clusterNamePopup, setClusterNamePopup] = useState<{
    bg: string;
    x: number;
    y: number;
    value: string;
  } | null>(null);

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
    if (!confirm('delete this person and all their mentions?')) return;
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

  const renameBucket = async (bg: string, name: string) => {
    const trimmed = name.trim();
    setRenamingBg(null);
    setRenameValue('');
    if (!trimmed) return;
    await fetch(`/api/buckets/${encodeURIComponent(bg)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    await fetchGraph();
  };

  const submitClusterName = async () => {
    if (!clusterNamePopup) return;
    const { bg, value } = clusterNamePopup;
    setClusterNamePopup(null);
    const trimmed = value.trim();
    if (!trimmed) return;
    await fetch(`/api/buckets/${encodeURIComponent(bg)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    await fetchGraph();
  };

  const handleHazeFaded = async (bg: string) => {
    if (!(graph.bucketNames ?? {})[bg]) return;
    await fetch(`/api/buckets/${encodeURIComponent(bg)}`, { method: 'DELETE' });
    await fetchGraph();
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

  const bucketCount = graph.nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.bg] = (acc[n.bg] ?? 0) + 1;
    return acc;
  }, {});
  const topBuckets = Object.entries(bucketCount).sort((a, b) => b[1] - a[1]);
  const customNames = graph.bucketNames ?? {};
  const labelFor = (bg: string) => customNames[bg] ?? bgLabels[bg] ?? bg;

  const cls = ['app'];
  if (leftCollapsed) cls.push('left-collapsed');
  if (rightCollapsed) cls.push('right-collapsed');

  const edgePeopleA = selectedEdge ? graph.nodes.find((n) => n.id === selectedEdge.a) : null;
  const edgePeopleB = selectedEdge ? graph.nodes.find((n) => n.id === selectedEdge.b) : null;

  return (
    <div className={cls.join(' ')}>
      <Sidebar
        nodes={graph.nodes}
        selectedId={selected?.id ?? null}
        onSelect={pickPerson}
        collapsed={leftCollapsed}
        onToggle={() => setLeftCollapsed((v) => !v)}
      />

      <div className="canvas">
        <div className="canvas-chrome">
          <div className="crumbs">
            graph · <b>{graph.nodes.length}</b> people · <b>{graph.edges.length}</b> edges
          </div>
          <div className="legend">
            {topBuckets.map(([bg, n]) =>
              renamingBg === bg ? (
                <input
                  key={bg}
                  className="legend-rename"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameBucket(bg, renameValue);
                    if (e.key === 'Escape') {
                      setRenamingBg(null);
                      setRenameValue('');
                    }
                  }}
                  onBlur={() => renameBucket(bg, renameValue)}
                />
              ) : (
                <span
                  key={bg}
                  className="legend-chip"
                  title="click to rename"
                  onClick={() => {
                    setRenamingBg(bg);
                    setRenameValue(labelFor(bg));
                  }}
                >
                  <i style={{ background: bgColors[bg] ?? '#8fc08f' }} />
                  {labelFor(bg)} · {n}
                </span>
              )
            )}
          </div>
        </div>

        <GraphCanvas
          graph={graph}
          onSelect={(n) => {
            setSelected(n);
            if (n) setSelectedEdge(null);
            setConnecting(false);
            setConnectQuery('');
          }}
          onSelectEdge={pickEdge}
          onClusterClick={(bg, sx, sy) => {
            setClusterNamePopup({ bg, x: sx, y: sy, value: '' });
          }}
          onHazeFaded={handleHazeFaded}
          onConnect={handleConnect}
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

        {clusterNamePopup && (
          <div
            className="cluster-name-popup"
            style={{ left: clusterNamePopup.x, top: clusterNamePopup.y }}
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
          </div>
        )}

        {selected && (
          <div className="detail-drawer">
            <div className="dd-head">
              <div>
                <div className="dd-name">{selected.name}</div>
                <div className="dd-sub">
                  {labelFor(selected.bg)} · {bgSubtitle[selected.bg] ?? ''}
                </div>
              </div>
              <button className="dd-close" onClick={() => setSelected(null)}>
                ×
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
              <div className="dd-section-label">background</div>
              <div className="dd-tags">
                {BG_KEYS.map((bg) => {
                  const active = selected.bg === bg;
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
                      {labelFor(bg)}
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
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
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
