"use client";
import { useState } from "react";
import { useProfileAutosave } from "./useProfileAutosave";
import {
  groupName,
  type Person,
  type Graph,
  type Memory,
} from "@/lib/graph/types";
import {
  circleIcon,
  circleColor,
  JUDGMENTS,
  CIRCLE_SECTIONS,
  closeness,
  suggestedCircles,
} from "@/lib/graph/indicators";
type Props = {
  person: Person | null;
  graph: Graph;
  memories: Memory[];
  busy: boolean;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
  onConnect: (id: number, weight: number, remove?: boolean) => Promise<void>;
  onSelect: (id: number) => void;
  onPendingChange: (pending: boolean) => void;
};
export default function PersonEditor({
  person,
  graph,
  memories,
  busy,
  onSave,
  onDelete,
  onClose,
  onConnect,
  onSelect,
  onPendingChange,
}: Props) {
  const [name, setName] = useState(person?.name ?? "");
  const [description, setDescription] = useState(person?.description ?? "");
  const [tags, setTags] = useState(person?.tags ?? []);
  const [circles, setCircles] = useState(person?.circles ?? []);
  const [strength, setStrength] = useState(person?.strength ?? 3);
  const [bg, setBg] = useState(person?.bg ?? "online");
  const [circle, setCircle] = useState("");
  const [connect, setConnect] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const { status, retry } = useProfileAutosave(
    { name, description, tags, circles, strength, bg },
    onSave,
    onPendingChange,
  );
  const toggleCircle = (c: string) =>
    setCircles((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c]));
  const presets = new Set(CIRCLE_SECTIONS.flatMap((s) => s.circles));
  const customCircles = [
    ...new Set([...graph.nodes.flatMap((p) => p.circles), ...circles]),
  ].filter((c) => !presets.has(c));
  const toggle = (tag: string) =>
    setTags((t) =>
      t.includes(tag) ? t.filter((v) => v !== tag) : [...t, tag],
    );
  const addCircle = (value: string) => {
    const c = value.trim();
    if (c && !circles.some((v) => v.toLowerCase() === c.toLowerCase()))
      setCircles((v) => [...v, c]);
    setCircle("");
  };
  const suggestions = suggestedCircles(description, circles);
  const circleChoice = (c: string) => (
    <button
      type="button"
      key={c}
      aria-label={`Circle: ${c}`}
      aria-pressed={circles.includes(c)}
      className={`circle-choice ${circles.includes(c) ? "selected" : ""}`}
      onClick={() => toggleCircle(c)}
    >
      <i style={{ background: circleColor(c) }} />
      {circleIcon(c)} {c}
      {circles.includes(c) ? " ×" : ""}
    </button>
  );
  const edges = graph.edges.filter(
    (e) => e.source === person?.id || e.target === person?.id,
  );
  return (
    <aside className="inspector compact-profile">
      <header className="panel-header">
        <span>IN YOUR ORBIT</span>
        <button onClick={onClose} aria-label="Close person details">
          ×
        </button>
      </header>
      <form
        className="person-form"
        onSubmit={(e) => {
          e.preventDefault();
          retry();
        }}
      >
        <input
          className="profile-name"
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={500}
        />
        <textarea
          aria-label="About this person"
          placeholder="What do you want to remember about them?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <div className="autosave-status" role="status">
          {status}
          {status.startsWith("Not saved") && (
            <button type="button" onClick={retry}>
              Retry
            </button>
          )}
        </div>
        <section className="trait-picker">
          <h3>
            Your judgment <small>Only you assign these</small>
          </h3>
          <div className="chip-row">
            {JUDGMENTS.map(([tag, icon, label]) => (
              <button
                type="button"
                key={tag}
                aria-pressed={tags.includes(tag)}
                className={`trait-chip ${tags.includes(tag) ? "selected" : ""}`}
                onClick={() => toggle(tag)}
              >
                {icon} {label}
              </button>
            ))}
            {tags
              .filter((t) => !JUDGMENTS.some(([key]) => key === t))
              .map((t) => (
                <button
                  type="button"
                  className="trait-chip selected"
                  key={t}
                  aria-pressed="true"
                  onClick={() => toggle(t)}
                >
                  {t} ×
                </button>
              ))}
          </div>
        </section>
        <fieldset className="closeness-picker">
          <legend>
            Closeness <span>{closeness({ strength })}</span>
          </legend>
          <div>
            {[
              [0, "Just met"],
              [3, "Acquaintance"],
              [5, "Know well"],
              [8, "Close"],
              [10, "Inner circle"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-label={String(label)}
                title={String(label)}
                aria-pressed={closeness({ strength }) === label}
                onClick={() => setStrength(Number(value))}
              >
                <span
                  style={{
                    width: 8 + Number(value),
                    height: 8 + Number(value),
                  }}
                />
                {String(label)}
              </button>
            ))}
          </div>
        </fieldset>
        <section className="circle-picker">
          <h3>
            Circles & areas{" "}
            <small>
              {circles.length
                ? `${circles.length} selected · tap to remove`
                : "People can belong to several"}
            </small>
          </h3>
          {circles.length ? (
            <div className="chip-row selected-circles">
              {circles.map(circleChoice)}
            </div>
          ) : (
            <p className="circle-empty">
              Add the interests and communities you share.
            </p>
          )}
          {!!suggestions.length && (
            <div className="suggested-circles">
              <small>From your note · tap to add</small>
              <div className="chip-row">
                {suggestions.map((c) => (
                  <button
                    type="button"
                    className="chip"
                    key={c}
                    onClick={() => addCircle(c)}
                  >
                    + {circleIcon(c)} {c}
                  </button>
                ))}
              </div>
            </div>
          )}
          <details className="circle-browser">
            <summary>Browse all circles</summary>
            {[
              ...CIRCLE_SECTIONS,
              ...(customCircles.length
                ? [{ name: "Your circles", circles: customCircles }]
                : []),
            ].map((section) => {
              const available = section.circles.filter(
                (c) => !circles.includes(c),
              );
              return available.length ? (
                <div className="circle-section" key={section.name}>
                  <h4>{section.name}</h4>
                  <div className="chip-row">{available.map(circleChoice)}</div>
                </div>
              ) : null;
            })}
          </details>
          <div className="inline-input">
            <input
              aria-label="New custom circle"
              placeholder="Make your own circle…"
              value={circle}
              onChange={(e) => setCircle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCircle(circle);
                }
              }}
            />
            <button
              type="button"
              disabled={!circle.trim()}
              onClick={() => addCircle(circle)}
            >
              Add
            </button>
          </div>
        </section>
        <details>
          <summary>Group & connections</summary>
          <label>
            Spatial group
            <select value={bg} onChange={(e) => setBg(e.target.value)}>
              {[
                ...new Set([
                  "online",
                  ...Object.keys(graph.bucketNames),
                  ...graph.nodes.map((p) => p.bg),
                ]),
              ].map((g) => (
                <option key={g} value={g}>
                  {groupName(g, graph.bucketNames)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Or name a new group
            <input
              aria-label="New group name"
              placeholder="e.g. Weekend crew"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (newGroup.trim()) {
                    setBg(`group:${newGroup.trim()}`);
                    setNewGroup("");
                  }
                }
              }}
            />
          </label>
          <button
            type="button"
            disabled={!newGroup.trim()}
            onClick={() => {
              setBg(`group:${newGroup.trim()}`);
              setNewGroup("");
            }}
          >
            Create group
          </button>
          {person && (
            <>
              <div className="inline-input">
                <select
                  aria-label="Connect to"
                  value={connect}
                  onChange={(e) => setConnect(e.target.value)}
                >
                  <option value="">Connect to…</option>
                  {graph.nodes
                    .filter((p) => p.id !== person.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !connect}
                  onClick={() =>
                    void onConnect(Number(connect), 5).catch(() => {})
                  }
                >
                  Link
                </button>
              </div>
              {edges.map((e) => {
                const id = e.source === person.id ? e.target : e.source;
                return (
                  <div className="connection-row" key={id}>
                    <button type="button" onClick={() => onSelect(id)}>
                      {graph.nodes.find((p) => p.id === id)?.name}
                    </button>
                    <button
                      type="button"
                      aria-label="Remove connection"
                      disabled={busy}
                      onClick={() =>
                        void onConnect(id, e.weight, true).catch(() => {})
                      }
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </details>
      </form>
      {person && (
        <details className="profile-extra">
          <summary>
            Shared memories ·{" "}
            {memories.filter((m) => m.personIds.includes(person.id)).length}
          </summary>
          {memories
            .filter((m) => m.personIds.includes(person.id))
            .map((m) => (
              <p className="memory-excerpt" key={m.id}>
                {m.body}
              </p>
            ))}
        </details>
      )}
      {person && (
        <details className="profile-extra">
          <summary>More</summary>
          <button className="danger" disabled={busy} onClick={onDelete}>
            Delete person
          </button>
          <small>Recoverable with Undo.</small>
        </details>
      )}
    </aside>
  );
}
