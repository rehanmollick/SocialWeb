'use client';

import { useState, useMemo } from 'react';
import type { GraphNode } from '../canvas';
import { tagColors, bgColors } from '../canvas';

type Props = {
  nodes: GraphNode[];
  selectedId: number | null;
  onSelect: (n: GraphNode) => void;
  collapsed: boolean;
  onToggle: () => void;
  bucketNames?: Record<string, string>;
  onSelectCluster?: (bg: string) => void;
};

export default function Sidebar({ nodes, selectedId, onSelect, collapsed, onToggle, bucketNames = {}, onSelectCluster }: Props) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'people' | 'clusters'>('people');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const sorted = [...nodes].sort((a, b) => b.strength - a.strength);
    if (!needle) return sorted;
    return sorted.filter((n) => n.name.toLowerCase().includes(needle));
  }, [nodes, q]);

  const clusters = useMemo(() => {
    const map: Record<string, { bg: string; count: number; name: string }> = {};
    for (const n of nodes) {
      if (!map[n.bg]) {
        map[n.bg] = { bg: n.bg, count: 0, name: bucketNames[n.bg] || '' };
      }
      map[n.bg].count++;
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [nodes, bucketNames]);

  const filteredClusters = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clusters;
    return clusters.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.bg.toLowerCase().includes(needle),
    );
  }, [clusters, q]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab${tab === 'people' ? ' active' : ''}`}
            onClick={() => setTab('people')}
          >
            people
          </button>
          <button
            className={`sidebar-tab${tab === 'clusters' ? ' active' : ''}`}
            onClick={() => setTab('clusters')}
          >
            clusters
          </button>
        </div>
        <span className="count">{tab === 'people' ? nodes.length : clusters.length}</span>
        <button className="panel-toggle" onClick={onToggle} aria-label="toggle sidebar">
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      <div className="search">
        <input placeholder="search..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {tab === 'people' && (
        <div className="people">
          {filtered.length === 0 && <div className="people-empty">no people yet — drop a thought below</div>}
          {filtered.map((n) => {
            const primary = n.tags.find((t) => t in tagColors) ?? 'friends';
            return (
              <div
                key={n.id}
                className={`person ${selectedId === n.id ? 'active' : ''}`}
                onClick={() => onSelect(n)}
                title={bucketNames[n.bg] ?? ''}
              >
                <span className="tagdot" style={{ background: tagColors[primary] ?? '#8fc08f' }} />
                <span className="name">{n.name}</span>
                <span className="meta">{n.strength.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'clusters' && (
        <div className="people">
          {filteredClusters.length === 0 && <div className="people-empty">no clusters yet</div>}
          {filteredClusters.map((c) => (
            <div
              key={c.bg}
              className="person"
              onClick={() => onSelectCluster?.(c.bg)}
              style={{ cursor: 'pointer' }}
            >
              <span
                className="tagdot"
                style={{ background: bgColors[c.bg] ?? '#8fc08f' }}
              />
              <span className="name">{c.name || c.bg.slice(0, 12)}</span>
              <span className="meta">{c.count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sidebar-foot">
        <span>local · sqlite</span>
        <span>/graph</span>
      </div>
    </aside>
  );
}
