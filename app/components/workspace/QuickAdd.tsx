"use client";
import { useRef, useState } from "react";
import { groupName, type Graph } from "@/lib/graph/types";
export type QuickAddDraft = { text: string; bg: string };
export default function QuickAdd({
  graph,
  onSave,
  onClose,
  initialBg = "online",
  draft,
  onDraftChange,
  onDiscardDraft,
  externalBusy = false,
}: {
  graph: Graph;
  initialBg?: string;
  onSave: (people: Record<string, unknown>[]) => Promise<void>;
  onClose: () => void;
  draft?: QuickAddDraft;
  onDraftChange?: (next: QuickAddDraft) => void;
  onDiscardDraft?: () => void;
  externalBusy?: boolean;
}) {
  const [localDraft, setLocalDraft] = useState<QuickAddDraft>(
    draft ?? { text: "", bg: initialBg },
  );
  const currentDraft = draft ?? localDraft;
  const draftRef = useRef(currentDraft);
  draftRef.current = currentDraft;
  const { text, bg } = currentDraft;
  const [saving, setBusy] = useState(false);
  const busy = saving || externalBusy;
  const [error, setError] = useState("");
  function changeDraft(patch: Partial<QuickAddDraft>) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setLocalDraft(next);
    onDraftChange?.(next);
  }
  const lines = text
    .split("\n")
    .map((value, index) => {
      const [name, ...note] = value.split("|");
      return {
        line: index + 1,
        raw: value.trim(),
        name: name.trim(),
        description: note.join("|").trim(),
      };
    })
    .filter((value) => value.raw);
  const missingNames = lines.filter((value) => !value.name);
  const existingNames = new Map(
    graph.nodes.map((person) => [person.name.toLowerCase(), person.name]),
  );
  const seen = new Set<string>();
  const repeatedNames = new Map<string, string>();
  const alreadyAdded = new Map<string, string>();
  for (const { name } of lines) {
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) repeatedNames.set(key, name);
    seen.add(key);
    const existing = existingNames.get(key);
    if (existing) alreadyAdded.set(key, existing);
  }
  const duplicates = [...new Map([...repeatedNames, ...alreadyAdded]).values()];
  const invalid =
    missingNames.length > 0 || lines.length > 100 || duplicates.length > 0;
  return (
    <div className="dock-tool-wrapper">
      <section
        className="dock-tool quick-add"
        role="region"
        aria-labelledby="quick-add-title"
      >
        <header>
          <div>
            <span className="eyebrow">GROW YOUR UNIVERSE</span>
            <h2 id="quick-add-title">Who’s in your orbit?</h2>
          </div>
          <button aria-label="Close add people" onClick={onClose}>
            ×
          </button>
        </header>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !lines.length || invalid) return;
            setBusy(true);
            setError("");
            try {
              await onSave(
                lines.map(({ name, description }) => {
                  return {
                    name,
                    strength: 3,
                    description,
                    bg,
                  };
                }),
              );
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not add people.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <textarea
            autoFocus
            aria-label="Names to add"
            aria-describedby="quick-add-help quick-add-count quick-add-validation"
            aria-invalid={invalid}
            disabled={busy}
            placeholder={
              "One name, or paste a whole list.\n\nMaya Chen\nLeo Brooks | makes great videos"
            }
            rows={6}
            value={text}
            onChange={(e) => {
              changeDraft({ text: e.target.value });
              setError("");
            }}
          />
          <p id="quick-add-help">
            One person per line. Add <b>| a short note</b> if you want. Names
            are enough.
          </p>
          <p id="quick-add-count" className="capture-count" role="status">
            {lines.length} / 100 people in this batch
          </p>
          <div id="quick-add-validation" className="capture-validation">
            {missingNames.length > 0 && (
              <p role="alert">
                {missingNames.length === 1 ? "Line" : "Lines"}{" "}
                {missingNames.map((value) => value.line).join(", ")}: add a name
                before the |, or remove the line.
              </p>
            )}
            {lines.length > 100 && (
              <p role="alert">
                Add up to 100 people at a time. Remove {lines.length - 100}{" "}
                {lines.length - 100 === 1 ? "line" : "lines"} and add them in
                another batch.
              </p>
            )}
            {duplicates.length > 0 && (
              <p role="alert" className="capture-duplicates">
                {duplicates.length} duplicate{" "}
                {duplicates.length === 1 ? "name" : "names"} to review:{" "}
                {duplicates.slice(0, 5).join(", ")}
                {duplicates.length > 5
                  ? `, and ${duplicates.length - 5} more`
                  : ""}
                .
                {alreadyAdded.size > 0
                  ? " Some names are already in your universe."
                  : " Names repeat in this batch."}{" "}
                Remove repeated entries or use distinct names before adding. No
                profiles will be merged.
              </p>
            )}
          </div>
          <details>
            <summary>Add everyone to a group</summary>
            <select
              aria-label="Group for new people"
              value={bg}
              disabled={busy}
              onChange={(e) => changeDraft({ bg: e.target.value })}
            >
              <option value="online">Unsorted</option>
              {[
                ...new Set([
                  ...Object.keys(graph.bucketNames),
                  ...graph.nodes.map((p) => p.bg),
                ]),
              ]
                .filter((g) => g !== "online")
                .map((g) => (
                  <option key={g} value={g}>
                    {groupName(g, graph.bucketNames)}
                  </option>
                ))}
            </select>
            <input
              aria-label="New group for people"
              placeholder="Or create a group…"
              value={bg.startsWith("group:") ? bg.slice(6) : ""}
              disabled={busy}
              onChange={(e) =>
                changeDraft({
                  bg: e.target.value ? `group:${e.target.value}` : "online",
                })
              }
            />
          </details>
          {error && <p role="alert">{error}</p>}
          <button
            className="primary"
            disabled={busy || !lines.length || invalid}
          >
            {saving || externalBusy
              ? "Adding…"
              : `Add ${lines.length > 1 ? `${lines.length} people` : "person"}`}
          </button>
          <div className="capture-draft-actions">
            <span className="muted">Kept while you switch panels.</span>
            <button
              type="button"
              className="subtle"
              disabled={busy || (!text && bg === "online")}
              onClick={() => {
                if (onDiscardDraft) onDiscardDraft();
                else {
                  changeDraft({ text: "", bg: "online" });
                  onClose();
                }
              }}
            >
              Discard draft
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
