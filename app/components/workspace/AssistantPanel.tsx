"use client";
import { useState, useRef, useEffect } from "react";
import type { Person } from "@/lib/graph/types";
export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  refs?: string[];
};
export default function AssistantPanel({
  people,
  selectedId,
  onSelect,
  ai,
  seed,
}: {
  // A question handed in from elsewhere; a new token asks it once.
  seed?: { token: number; question: string };
  people: Person[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  ai: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({
      top: body.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);
  const asked = useRef(0);
  useEffect(() => {
    if (!seed || seed.token === asked.current) return;
    asked.current = seed.token;
    void ask(seed.question);
  }, [seed]);
  async function ask(preset?: string) {
    const question = (preset ?? input).trim();
    if (!question || busy || !ai) return;
    if (!preset) setInput("");
    setBusy(true);
    const history = [...messages, { role: "user" as const, content: question }];
    setMessages(history);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          selectedId,
          history: messages
            .slice(-8)
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed.");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, refs: data.refs },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            e instanceof Error
              ? e.message
              : "Could not reach Claude. Try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }
  const selected = people.find((p) => p.id === selectedId);
  return (
    <aside className="assistant-panel">
      <header className="panel-header">
        <span>✦ YOUR MEMORY, CONNECTED</span>
        <span className={`status-dot ${ai ? "online" : ""}`} />
      </header>
      <div className="assistant-scroll" ref={body}>
        {!messages.length && (
          <div className="assistant-welcome">
            <span className="large-spark">✧</span>
            <h2>
              Find the right
              <br />
              person for the moment.
            </h2>
            <p>
              Explore what you already know. Turn your memories into a next
              step.
            </p>
            <div className="prompt-list">
              {[
                "Who should I reconnect with?",
                "Who could help with what I'm working on?",
                "What have I been meaning to do with people?",
              ].map((q) => (
                <button key={q} onClick={() => setInput(q)}>
                  {q}
                  <span>↗</span>
                </button>
              ))}
            </div>
            <div className="quiet-note">
              Your high-signal and high-agency labels are yours alone. Claude
              never assigns them.
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <article className={`chat-message ${m.role}`} key={i}>
            <small>{m.role === "user" ? "YOU" : "CLAUDE"}</small>
            <p>{m.content}</p>
            {m.refs && (
              <div className="chip-row">
                {m.refs.map((name) => {
                  const p = people.find((p) => p.name === name);
                  return (
                    p && (
                      <button
                        className="chip"
                        key={name}
                        onClick={() => onSelect(p.id)}
                      >
                        {name} ↗
                      </button>
                    )
                  );
                })}
              </div>
            )}
          </article>
        ))}
        {busy && <p className="thinking">Connecting the dots…</p>}
      </div>
      <div className="assistant-compose">
        {selected && (
          <div className="context-pill">Context: {selected.name}</div>
        )}
        <textarea
          aria-label="Ask your memory"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            ai ? "Ask about your people…" : "Claude is not connected yet"
          }
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <div className="compose-footer">
          <small>
            {ai
              ? "Claude · grounded in your notes"
              : "Claude is not connected · check Settings"}
          </small>
          <button
            aria-label="Send question"
            className="primary"
            onClick={() => void ask()}
            disabled={!input.trim() || busy || !ai}
          >
            ↑
          </button>
        </div>
      </div>
    </aside>
  );
}
