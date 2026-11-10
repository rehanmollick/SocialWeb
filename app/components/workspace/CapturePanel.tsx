"use client";
import { useState } from "react";

export type FiledItem = {
  name: string;
  personId: number | null;
  bullets: string[];
  nextStep: string;
  circles: string[];
};
type Row = FiledItem & { include: boolean; notes: string };

// Write freely; Claude proposes which bullet belongs on whose profile. Nothing
// is saved until the reviewed rows are confirmed.
export default function CapturePanel({
  text,
  onTextChange,
  onPreview,
  onApply,
  onClose,
}: {
  text: string;
  onTextChange: (text: string) => void;
  onPreview: (text: string) => Promise<FiledItem[]>;
  onApply: (text: string, items: FiledItem[]) => Promise<void>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState<"filing" | "saving" | null>(null);
  const [message, setMessage] = useState("");
  const update = (i: number, patch: Partial<Row>) =>
    setRows(
      (r) => r && r.map((row, j) => (j === i ? { ...row, ...patch } : row)),
    );
  const chosen = (rows ?? []).filter((r) => r.include && r.name.trim());
  async function file() {
    if (!text.trim() || pending) return;
    setPending("filing");
    setMessage("");
    try {
      const people = await onPreview(text);
      setRows(
        people.map((p) => ({
          ...p,
          include: true,
          notes: p.bullets.join("\n"),
        })),
      );
      if (!people.length)
        setMessage("No one is named in that. Mention people by name.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not file that.");
    } finally {
      setPending(null);
    }
  }
  async function save() {
    if (!chosen.length || pending) return;
    setPending("saving");
    setMessage("");
    try {
      await onApply(
        text,
        chosen.map(({ include: _include, notes, ...item }) => ({
          ...item,
          name: item.name.trim(),
          bullets: notes
            .split("\n")
            .map((b) => b.replace(/^[•\-*]\s*/, "").trim())
            .filter(Boolean),
        })),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
      setPending(null);
    }
  }
  return (
    <div className="dock-tool-wrapper">
      <section
        className="dock-tool capture-panel"
        role="region"
        aria-labelledby="capture-title"
      >
        <header>
          <h2 id="capture-title">Brain dump</h2>
          <button onClick={onClose} aria-label="Close brain dump">
            ×
          </button>
        </header>
        <p>
          Write what happened or who is on your mind. Claude sorts it onto the
          right profiles and you approve it.
        </p>
        <textarea
          aria-label="Brain dump"
          rows={rows ? 4 : 9}
          autoFocus
          placeholder={
            "Had coffee with Sam, he's starting a design studio and wants help with content. Need to intro him to Priya.\nHaven't seen Jo in ages, should plan a dinner."
          }
          value={text}
          disabled={pending !== null}
          onChange={(e) => {
            onTextChange(e.target.value);
            setRows(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void file();
          }}
        />
        {!rows && (
          <button
            className="primary"
            disabled={!text.trim() || pending !== null}
            onClick={() => void file()}
          >
            {pending === "filing" ? "Sorting…" : "✧ Sort onto profiles"}
          </button>
        )}
        {rows?.map((row, i) => (
          <article
            className={`capture-row ${row.include ? "" : "skipped"}`}
            key={i}
          >
            <label className="capture-who">
              <input
                type="checkbox"
                checked={row.include}
                aria-label={`File under ${row.name}`}
                onChange={(e) => update(i, { include: e.target.checked })}
              />
              {row.personId ? (
                <strong>{row.name}</strong>
              ) : (
                <input
                  aria-label="New person name"
                  value={row.name}
                  maxLength={100}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              )}
              {!row.personId && <em>new person</em>}
            </label>
            <textarea
              aria-label={`Notes for ${row.name}`}
              rows={Math.min(6, Math.max(2, row.notes.split("\n").length))}
              value={row.notes}
              disabled={!row.include}
              onChange={(e) => update(i, { notes: e.target.value })}
            />
            <input
              aria-label={`Next step with ${row.name}`}
              placeholder="Next step (optional)"
              value={row.nextStep}
              maxLength={120}
              disabled={!row.include}
              onChange={(e) => update(i, { nextStep: e.target.value })}
            />
            {row.circles.length > 0 && (
              <div className="chip-row">
                {row.circles.map((c) => (
                  <button
                    type="button"
                    className="chip active"
                    key={c}
                    disabled={!row.include}
                    aria-label={`Remove ${c} from ${row.name}`}
                    onClick={() =>
                      update(i, { circles: row.circles.filter((v) => v !== c) })
                    }
                  >
                    {c} ×
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
        {message && (
          <p role="status" className="inline-notice">
            {message}
          </p>
        )}
        {rows && rows.length > 0 && (
          <footer>
            <p>Saved as one change. Undo reverses all of it.</p>
            <button
              className="primary"
              disabled={!chosen.length || pending !== null}
              onClick={() => void save()}
            >
              {pending === "saving"
                ? "Saving…"
                : `Save to ${chosen.length} ${chosen.length === 1 ? "profile" : "profiles"}`}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
