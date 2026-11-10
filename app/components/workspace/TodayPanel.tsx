"use client";
import type { Nudge } from "@/lib/graph/nudges";

const SECTIONS: [Nudge["kind"], string, string][] = [
  ["next", "Open next steps", "→"],
  ["reconnect", "Gone quiet", "◔"],
  ["blank", "Still a blank", "✎"],
];

export default function TodayPanel({
  nudges,
  ai,
  onSelect,
  onAsk,
  onClose,
}: {
  nudges: Nudge[];
  ai: boolean;
  onSelect: (id: number) => void;
  onAsk: (question: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="dock-tool-wrapper">
      <section
        className="dock-tool today-panel"
        role="region"
        aria-labelledby="today-title"
      >
        <header>
          <h2 id="today-title">On your radar</h2>
          <button onClick={onClose} aria-label="Close radar">
            ×
          </button>
        </header>
        {!nudges.length && (
          <p>
            Nothing pending. Add a next step to someone, or mark who matters,
            and it shows up here.
          </p>
        )}
        {SECTIONS.map(([kind, title, icon]) => {
          const items = nudges.filter((n) => n.kind === kind);
          return items.length ? (
            <div key={kind}>
              <h3>
                {title} · {items.length}
              </h3>
              {items.map((n) => (
                <button
                  className="nudge"
                  key={`${kind}-${n.personId}`}
                  onClick={() => onSelect(n.personId)}
                >
                  <span aria-hidden="true">{icon}</span>
                  <span>
                    <strong>{n.title}</strong>
                    <small>{n.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null;
        })}
        {ai && (
          <footer>
            <p>Want a second opinion on where to spend your time?</p>
            <button
              onClick={() =>
                onAsk(
                  "Looking at my notes, next steps and who I have not touched in a while: what are the 3 most worthwhile things to do with people this week, and why?",
                )
              }
            >
              ✧ Ask Claude what to do this week
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
