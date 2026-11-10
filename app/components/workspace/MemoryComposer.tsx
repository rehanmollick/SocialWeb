"use client";
import { useEffect, useRef, useState } from "react";
import type { Person, Memory } from "@/lib/graph/types";
export type MemoryCaptureDraft = { body: string; personIds: number[] };
export default function MemoryComposer({
  people,
  selectedId,
  onSave,
  onClose,
  ai,
  memory,
  onCreatePerson,
  localOnly = false,
  draft,
  onDraftChange,
  onDiscardDraft,
  externalBusy = false,
}: {
  memory: Memory | null;
  onCreatePerson: (name: string) => Promise<number>;
  people: Person[];
  selectedId: number | null;
  onSave: (body: string, ids: number[]) => Promise<void>;
  onClose: () => void;
  ai: boolean;
  localOnly?: boolean;
  draft?: MemoryCaptureDraft;
  onDraftChange?: (next: MemoryCaptureDraft) => void;
  onDiscardDraft?: () => void;
  externalBusy?: boolean;
}) {
  const [localDraft, setLocalDraft] = useState<MemoryCaptureDraft>(
    draft ?? {
      body: memory?.body ?? "",
      personIds: memory?.personIds ?? (selectedId ? [selectedId] : []),
    },
  );
  const currentDraft = draft ?? localDraft;
  const draftRef = useRef(currentDraft);
  draftRef.current = currentDraft;
  const { body, personIds: ids } = currentDraft;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function changeDraft(patch: Partial<MemoryCaptureDraft>) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setLocalDraft(next);
    onDraftChange?.(next);
  }
  function setIds(update: (ids: number[]) => number[]) {
    changeDraft({ personIds: update(draftRef.current.personIds) });
  }
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<
    "finding" | "creating" | "saving" | null
  >(null);
  const busy = pending !== null || externalBusy;
  const [message, setMessage] = useState("");
  const [newNames, setNewNames] = useState<string[]>([]);
  const selectedPeople = people.filter((person) => ids.includes(person.id));
  const candidates = people.filter(
    (person) =>
      !ids.includes(person.id) &&
      person.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  async function suggest() {
    if (busy || !body.trim()) return;
    setPending("finding");
    setMessage("");
    try {
      if (localOnly) {
        const found = people
          .filter((p) => body.toLowerCase().includes(p.name.toLowerCase()))
          .map((p) => p.id);
        setIds((v) => [...new Set([...v, ...found])]);
        setMessage(
          `${found.length} demo people suggested. Review the selections.`,
        );
        return;
      }
      const r = await fetch("/api/memories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, preview: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!mounted.current) return;
      const missing: string[] = [];
      const found: number[] = [];
      for (const s of d.suggestions) {
        const p = people.find(
          (p) => p.name.toLowerCase() === s.name.toLowerCase(),
        );
        if (p) found.push(p.id);
        else missing.push(s.name);
      }
      setIds((v) => [...new Set([...v, ...found])]);
      setNewNames(missing);
      setMessage(
        `${found.length} known people suggested. Review the selections.${missing.length ? ` New names: ${missing.join(", ")}. Create profiles below or save without linking them.` : ""}`,
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not extract people. You can still save this note.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="dock-tool-wrapper">
      <section
        className="dock-tool"
        role="region"
        aria-labelledby="memory-title"
      >
        <header>
          <div>
            <span className="eyebrow">CAPTURE THE CONTEXT</span>
            <h2 id="memory-title">A moment worth remembering.</h2>
          </div>
          <button aria-label="Close memory" onClick={onClose}>
            ×
          </button>
        </header>
        <textarea
          autoFocus
          className="memory-input"
          aria-label="Memory note"
          placeholder="Who did you meet? What’s worth remembering?"
          value={body}
          onChange={(e) => changeDraft({ body: e.target.value })}
          rows={6}
          disabled={busy}
        />
        <div className="label-row">
          <h3>People in this memory</h3>
          <button
            className="subtle"
            onClick={() => void suggest()}
            disabled={!body.trim() || busy}
          >
            {pending === "finding"
              ? "Finding people…"
              : ai
                ? "✦ Suggest with Claude"
                : "Find known names"}
          </button>
        </div>
        <div className="memory-selected" aria-label="Selected people">
          <p className="memory-link-label">
            {selectedPeople.length}{" "}
            {selectedPeople.length === 1 ? "person" : "people"} linked
          </p>
          <div className="memory-people">
            {selectedPeople.map((person) => (
              <button
                key={person.id}
                className="chip active"
                aria-label={`Remove ${person.name} from memory`}
                aria-pressed="true"
                disabled={busy}
                onClick={() =>
                  setIds((value) => value.filter((id) => id !== person.id))
                }
              >
                {person.name} <span aria-hidden="true">×</span>
              </button>
            ))}
            {!selectedPeople.length && (
              <p className="muted">
                Link people below, or save the memory on its own.
              </p>
            )}
          </div>
        </div>
        <input
          aria-label="Find people to link"
          placeholder="Find people to link…"
          value={search}
          disabled={busy}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="memory-people">
          {candidates.map((p) => (
            <button
              key={p.id}
              className="chip"
              aria-label={`Link ${p.name} to memory`}
              aria-pressed="false"
              disabled={busy}
              onClick={() => setIds((v) => [...new Set([...v, p.id])])}
            >
              + {p.name}
            </button>
          ))}
          {!people.length && (
            <p className="muted">You can save this now and add people later.</p>
          )}
          {people.length > 0 && !candidates.length && (
            <p className="muted" role="status">
              {search.trim()
                ? `No unlinked people match “${search.trim()}”. Try another name or clear the search.`
                : "Everyone is linked to this memory."}
            </p>
          )}
        </div>
        {newNames.length > 0 && (
          <div className="memory-people">
            {newNames.map((name) => (
              <button
                disabled={busy}
                key={name}
                onClick={async () => {
                  setPending("creating");
                  try {
                    const id = await onCreatePerson(name);
                    if (!mounted.current) return;
                    setIds((v) => [...new Set([...v, id])]);
                    setNewNames((v) => v.filter((n) => n !== name));
                  } catch (e) {
                    setMessage(
                      e instanceof Error
                        ? e.message
                        : "Could not create person.",
                    );
                  } finally {
                    setPending(null);
                  }
                }}
              >
                + Create {name}
              </button>
            ))}
          </div>
        )}
        {message && (
          <p role="status" className="inline-notice">
            {message}
          </p>
        )}
        <footer>
          <p>
            Linking a memory does not change closeness or create connections.
          </p>
          <button
            className="primary"
            disabled={!body.trim() || busy}
            onClick={async () => {
              if (busy || !body.trim()) return;
              setPending("saving");
              setMessage("");
              try {
                await onSave(body, ids);
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Could not save.");
              } finally {
                setPending(null);
              }
            }}
          >
            {pending === "saving" ? "Saving memory…" : "Save memory"}
          </button>
        </footer>
        <div className="capture-draft-actions">
          <span className="muted">Kept while you switch panels.</span>
          <button
            type="button"
            className="subtle"
            disabled={busy || (!body && !ids.length)}
            onClick={() => {
              if (onDiscardDraft) onDiscardDraft();
              else {
                changeDraft({ body: "", personIds: [] });
                onClose();
              }
            }}
          >
            Discard draft
          </button>
        </div>
      </section>
    </div>
  );
}
