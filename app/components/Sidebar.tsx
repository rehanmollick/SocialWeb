'use client';

import { useState, useMemo } from 'react';
import type { GraphNode } from '../canvas';
import { tagColors } from '../canvas';

type Props = {
  nodes: GraphNode[];
  selectedId: number | null;
  onSelect: (n: GraphNode) => void;
  collapsed: boolean;
  onToggle: () => void;
  bucketNames?: Record<string, string>;
};

export default function Sidebar({ nodes, selectedId, onSelect, collapsed, onToggle, bucketNames = {} }: Props) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const sorted = [...nodes].sort((a, b) => b.strength - a.strength);
    if (!needle) return sorted;
    return sorted.filter((n) => n.name.toLowerCase().includes(needle));
  }, [nodes, q]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="title">people</span>
        <span className="count">{nodes.length}</span>
        <button className="panel-toggle" onClick={onToggle} aria-label="toggle sidebar">
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      <div className="search">
        <input placeholder="search..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
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
      <div className="sidebar-foot">
        <span>local · sqlite</span>
        <span>/graph</span>
      </div>
    </aside>
  );
}
