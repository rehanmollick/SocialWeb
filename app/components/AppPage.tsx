'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GraphCanvas, {
  tagColors,
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
  } | null>(null);
  const [createPopup, setCreatePopup] = useState<{
    x: number;
    y: number;
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

  const customNames = graph.bucketNames ?? {};
  // only custom names — presets intentionally empty so clusters stay unnamed until the user names them.
  const labelFor = (bg: string) => customNames[bg] ?? '';

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
          onClusterClick={(bg, sx, sy) => {
            setClusterNamePopup({ bg, x: sx, y: sy, value: '' });
          }}
          onHazeFaded={handleHazeFaded}
          onConnect={handleConnect}
          onCreateAt={(sx, sy, bg) => {
            setCreatePopup({ x: sx, y: sy, bg, name: '', description: '', tags: [] });
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
