'use client';

import { useEffect, useRef, useState } from 'react';

type ThoughtRow = {
  id: number;
  body: string;
  createdAt: string;
  mentions: string[];
};

type ChatMsg =
  | { kind: 'thought'; id: number; body: string; createdAt: string; mentions: string[] }
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; refs: string[] };

type Props = {
  refreshKey: number;
  collapsed: boolean;
  onToggle: () => void;
};

export default function MemoryPanel({ refreshKey, collapsed, onToggle }: Props) {
  const [thoughts, setThoughts] = useState<ThoughtRow[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [q, setQ] = useState('');
  const [asking, setAsking] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLTextAreaElement>(null);
  const lastAutoH = useRef(0);
  const userResized = useRef(false);

  const autosize = () => {
    if (userResized.current) return;
    const el = askRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(el.scrollHeight, window.innerHeight * 0.6);
    el.style.height = `${h}px`;
    lastAutoH.current = h;
  };

  useEffect(() => {
    autosize();
  }, [q]);

  useEffect(() => {
    const el = askRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      if (Math.abs(h - lastAutoH.current) > 2) {
        userResized.current = true;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/thoughts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setThoughts(data.thoughts ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat, thoughts]);

  const ask = async () => {
    const question = q.trim();
    if (!question || asking) return;
    const userId = `u-${Date.now()}`;
    setChat((c) => [...c, { kind: 'user', id: userId, text: question }]);
    setQ('');
    setAsking(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = (await res.json()) as { answer?: string; refs?: string[]; error?: string };
      setChat((c) => [
        ...c,
        {
          kind: 'assistant',
          id: `a-${Date.now()}`,
          text: data.answer ?? data.error ?? '(no response)',
          refs: data.refs ?? [],
        },
      ]);
    } catch (err) {
      setChat((c) => [
        ...c,
        { kind: 'assistant', id: `a-${Date.now()}`, text: 'request failed', refs: [] },
      ]);
    } finally {
      setAsking(false);
    }
  };

  const timeline: ChatMsg[] = [
    ...thoughts
      .slice()
      .reverse()
      .map<ChatMsg>((t) => ({
        kind: 'thought',
        id: t.id,
        body: t.body,
        createdAt: t.createdAt,
        mentions: t.mentions,
      })),
    ...chat,
  ];

  return (
    <aside className="aipanel">
      <div className="ai-head">
        <div className="title">memory</div>
        <div className="model">claude haiku</div>
        <button className="panel-toggle" onClick={onToggle} aria-label="toggle memory panel">
          {collapsed ? '‹' : '›'}
        </button>
      </div>
      <div className="ai-body" ref={bodyRef}>
        {timeline.length === 0 && (
          <div className="ai-body-empty">
            no thoughts yet.
            <br />
            drop one below and claude will extract the people.
            <br />
            then ask the graph anything.
          </div>
        )}
        {timeline.map((m) => {
          if (m.kind === 'thought') {
            return (
              <div key={`t${m.id}`} className="msg user">
                <div className="role">
                  you ·{' '}
                  {new Date(m.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
                <div className="text">{m.body}</div>
                {m.mentions.length > 0 && (
                  <div className="refs">
                    {m.mentions.map((name) => (
                      <span key={name} className="ref">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          if (m.kind === 'user') {
            return (
              <div key={m.id} className="msg user">
                <div className="role">you</div>
                <div className="text">{m.text}</div>
              </div>
            );
          }
          return (
            <div key={m.id} className="msg assistant">
              <div className="role">claude</div>
              <div className="text">{m.text}</div>
              {m.refs.length > 0 && (
                <div className="refs">
                  {m.refs.map((name) => (
                    <span key={name} className="ref">
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {asking && (
          <div className="msg assistant">
            <div className="role">claude</div>
            <div className="text" style={{ color: 'var(--fg-muted)' }}>thinking...</div>
          </div>
        )}
      </div>
      <div className="ai-input">
        <div className="box">
          <textarea
            ref={askRef}
            placeholder="ask your graph... who do i know in sf that climbs?"
            value={q}
            rows={2}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            disabled={asking}
          />
          <div className="toolbar">
            <div className="pills">
              <span className="pill" onClick={() => setQ('who are my strongest connections?')}>
                strongest
              </span>
              <span className="pill" onClick={() => setQ('summarize the last week')}>
                summarize
              </span>
            </div>
            <span className="send">
              <b>↵</b> send · <b>⇧↵</b> newline
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
