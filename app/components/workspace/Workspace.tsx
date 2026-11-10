"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RelationshipMap from "./RelationshipMap";
import PersonEditor from "./PersonEditor";
import AssistantPanel from "./AssistantPanel";
import MemoryComposer, { type MemoryCaptureDraft } from "./MemoryComposer";
import QuickAdd, { type QuickAddDraft } from "./QuickAdd";
import MapKey from "./MapKey";
import CapturePanel, { type FiledItem } from "./CapturePanel";
import TodayPanel from "./TodayPanel";
import { nudges as findNudges } from "@/lib/graph/nudges";
import { demoRequest, resetDemo } from "@/lib/graph/demo";
import { closeness, closenessLevel } from "@/lib/graph/indicators";
import {
  colorFor,
  groupName,
  type Graph,
  type Memory,
  type Person,
} from "@/lib/graph/types";
const EMPTY: Graph = {
  nodes: [],
  edges: [],
  bucketNames: {},
  clusterEdges: [],
};
async function personalApi(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
type View = "map" | "doing" | "people" | "memories";
// In the Doing view each person appears once per circle. A virtual node's id
// packs the person and the circle so drags can be mapped back.
const SLOTS = 1000;
const NO_CIRCLE = "circle:";
export default function Workspace() {
  const [mode, setMode] = useState<"demo" | "personal" | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [addPoint, setAddPoint] = useState<{
    x: number;
    y: number;
    bg: string;
  } | null>(null);
  const api = useCallback(
    (path: string, method = "GET", body?: any) =>
      mode === "demo"
        ? demoRequest(path, method, body)
        : personalApi(path, method, body),
    [mode],
  );
  useEffect(() => {
    const stored = localStorage.getItem("socialweb-mode");
    if (stored === "personal" || stored === "demo") return setMode(stored);
    // First visit: open your own people when there are any, else the demo.
    let alive = true;
    personalApi("graph")
      .then(
        (g: Graph) => alive && setMode(g.nodes.length ? "personal" : "demo"),
      )
      .catch(() => alive && setMode("demo"));
    return () => {
      alive = false;
    };
  }, []);
  function switchMode() {
    if (busy || dirtyProfiles.size) return;
    closeTool();
    const next = mode === "demo" ? "personal" : "demo";
    localStorage.setItem("socialweb-mode", next);
    setMode(next);
    setLoaded(false);
    setSelected(null);
    setEditing(false);
    setRightOpen(false);
    setNotice("");
    setView("map");
    clear();
  }
  const [graph, setGraph] = useState<Graph>(EMPTY);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("map");
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<Memory | null>(null);
  const [addDrafts, setAddDrafts] = useState<
    Record<string, QuickAddDraft & { point?: typeof addPoint }>
  >({});
  const [memoryDrafts, setMemoryDrafts] = useState<
    Record<string, MemoryCaptureDraft>
  >({});
  const addDraftKey = `${mode}:add`;
  const memoryDraftKey = `${mode}:memory:${memoryDraft?.id ?? "new"}`;
  const [query, setQuery] = useState("");
  const [lens, setLens] = useState("all");
  const [circle, setCircle] = useState("");
  const [group, setGroup] = useState("");
  const [focus, setFocus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirtyProfiles, setDirtyProfiles] = useState<Set<number>>(new Set());
  const mutations = useRef<Promise<unknown>>(Promise.resolve());
  const pendingMutations = useRef(0);
  const [ai, setAi] = useState(false);
  const [history, setHistory] = useState("");
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [legend, setLegend] = useState(false);
  const [dumping, setDumping] = useState(false);
  const [radar, setRadar] = useState(false);
  const [dumpText, setDumpText] = useState("");
  const [askSeed, setAskSeed] = useState<{ token: number; question: string }>();
  function showTool(
    tool:
      | "add"
      | "memory"
      | "settings"
      | "help"
      | "legend"
      | "profile"
      | "ask"
      | "dump"
      | "radar",
  ) {
    setDumping(tool === "dump");
    setRadar(tool === "radar");
    setAdding(tool === "add");
    setCapturing(tool === "memory");
    setSettings(tool === "settings");
    setHelp(tool === "help");
    setLegend(tool === "legend");
    setEditing(tool === "profile");
    setRightOpen(true);
  }
  function closeTool() {
    setDumping(false);
    setRadar(false);
    setAdding(false);
    setCapturing(false);
    setSettings(false);
    setHelp(false);
    setLegend(false);
    setEditing(false);
    setRightOpen(false);
  }
  const activeTool = dumping
    ? "dump"
    : radar
      ? "radar"
      : adding
        ? "add"
        : capturing
          ? "memory"
          : settings
            ? "settings"
            : help
              ? "help"
              : legend
                ? "legend"
                : editing
                  ? "profile"
                  : "ask";
  const toolRef = useRef({ activeTool, memoryDraftKey });
  toolRef.current = { activeTool, memoryDraftKey };
  const [linkA, setLinkA] = useState("");
  const [linkB, setLinkB] = useState("");
  const [linkWeight, setLinkWeight] = useState(5);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    if (!mode) return;
    const [g, m, h, s] = await Promise.all([
      api("graph"),
      api("memories"),
      api("history"),
      api("status"),
    ]);
    if (modeRef.current !== mode) return;
    setGraph(g);
    setMemories(m.thoughts);
    setHistory(h.entries[0]?.label ?? "");
    setAi(s.ai);
    setLoaded(true);
  }, [api, mode]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setLeftOpen(true);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
      if (e.key === "Escape") {
        setDumping(false);
        setRadar(false);
        setCapturing(false);
        setEditing(false);
        setAdding(false);
        setSettings(false);
        setHelp(false);
        setLegend(false);
        setRightOpen(false);
        setLeftOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  async function action(fn: () => Promise<unknown>, message: string) {
    pendingMutations.current++;
    setBusy(true);
    const job = mutations.current
      .catch(() => {})
      .then(async () => {
        setError("");
        try {
          await fn();
          await refresh();
          if (modeRef.current === mode) setNotice(message);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong.");
          await refresh().catch(() => {});
          throw e;
        } finally {
          pendingMutations.current--;
          setBusy(pendingMutations.current > 0);
        }
      });
    mutations.current = job;
    await job;
  }
  function run(fn: () => Promise<unknown>, message: string) {
    void action(fn, message).catch(() => {});
  }
  function select(id: number) {
    setSelected(id);
    showTool("profile");
    setFocus((f) => f + 1);
  }
  const circles = [...new Set(graph.nodes.flatMap((p) => p.circles))].sort();
  const groups = [
    ...new Set([
      ...Object.keys(graph.bucketNames),
      ...graph.nodes.map((p) => p.bg),
    ]),
  ];
  const filtered = useMemo(
    () =>
      graph.nodes
        .filter((p) => {
          const text = [
            p.name,
            p.description,
            ...p.circles,
            ...p.tags,
            groupName(p.bg, graph.bucketNames),
          ]
            .join(" ")
            .toLowerCase();
          return (
            (!query.trim() ||
              query
                .toLowerCase()
                .trim()
                .split(/\s+/)
                .every((word) => text.includes(word))) &&
            (lens === "all" || p.tags.includes(lens)) &&
            (!circle || p.circles.includes(circle)) &&
            (!group || p.bg === group)
          );
        })
        .sort(
          (a, b) =>
            Number(b.tags.includes("highsignal")) -
              Number(a.tags.includes("highsignal")) ||
            b.strength - a.strength ||
            a.name.localeCompare(b.name),
        ),
    [graph, query, lens, circle, group],
  );
  const matches = useMemo(() => new Set(filtered.map((p) => p.id)), [filtered]);
  const filteredMemories = useMemo(
    () =>
      memories.filter((memory) => {
        const linkedPeople = graph.nodes.filter((p) =>
          memory.personIds.includes(p.id),
        );
        const text = [memory.body, ...linkedPeople.map((p) => p.name)]
          .join(" ")
          .toLowerCase();
        return (
          (!query.trim() ||
            query
              .toLowerCase()
              .trim()
              .split(/\s+/)
              .every((word) => text.includes(word))) &&
          (!(lens !== "all" || circle || group) ||
            linkedPeople.some(
              (p) =>
                (lens === "all" || p.tags.includes(lens)) &&
                (!circle || p.circles.includes(circle)) &&
                (!group || p.bg === group),
            ))
        );
      }),
    [memories, graph.nodes, query, lens, circle, group],
  );
  const person = graph.nodes.find((p) => p.id === selected) ?? null;
  const radarItems = useMemo(() => findNudges(graph.nodes), [graph.nodes]);
  const doing = useMemo(() => {
    const names = [...new Set(graph.nodes.flatMap((p) => p.circles))].sort();
    const key = (p: Person, c: string) =>
      p.id * SLOTS + (c ? names.indexOf(c) + 1 : 0);
    return {
      names,
      key,
      graph: {
        nodes: graph.nodes.flatMap((p) =>
          (p.circles.length ? p.circles : [""]).map((c) => ({
            ...p,
            id: key(p, c),
            bg: `${NO_CIRCLE}${c}`,
            x: null,
            y: null,
            pinToMe: false,
          })),
        ),
        edges: [],
        clusterEdges: [],
        bucketNames: {
          [NO_CIRCLE]: "Nothing going on yet",
          ...Object.fromEntries(names.map((c) => [`${NO_CIRCLE}${c}`, c])),
        },
      } satisfies Graph,
    };
  }, [graph.nodes]);
  const doingMatches = useMemo(
    () =>
      new Set(
        doing.graph.nodes
          .filter((n) => matches.has(Math.floor(n.id / SLOTS)))
          .map((n) => n.id),
      ),
    [doing, matches],
  );
  const filtering = !!(query.trim() || lens !== "all" || circle || group);
  function clear() {
    setQuery("");
    setLens("all");
    setCircle("");
    setGroup("");
  }
  const card = (p: Person) => (
    <button className="person-card" key={p.id} onClick={() => select(p.id)}>
      <div className="card-top">
        <div className="avatar" style={{ color: colorFor(p.bg) }}>
          {p.name
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")}
        </div>
        <span>
          {p.tags.includes("highsignal") && <b className="signal-mark">✦</b>}{" "}
          {p.tags.includes("highagency") && <b className="agency-mark">ϟ</b>}
        </span>
      </div>
      <h3>{p.name}</h3>
      <small>
        {groupName(p.bg, graph.bucketNames)} · {closeness(p)} (
        {closenessLevel(p)}/5)
      </small>
      <p>{p.description || "Add what makes this person worth remembering."}</p>
      <div className="chip-row">
        {p.circles.slice(0, 3).map((c) => (
          <span className="chip" key={c}>
            {c}
          </span>
        ))}
      </div>
    </button>
  );
  return (
    <div className="workspace space-workspace">
      <header className="app-header">
        <a href="/" className="brand">
          <span className="brand-symbol">✳</span>socialweb
          <span className="brand-separator">/</span>
          <small>your personal universe</small>
        </a>
        <div className="header-actions">
          <div className="universe-mode">
            <span className="mode-label">
              {mode === "demo" ? "◌ Demo universe" : "◉ My people"}
            </span>
            <button
              className="universe-switch"
              disabled={busy || dirtyProfiles.size > 0}
              onClick={switchMode}
              title="Switch between fictional demo and your personal people"
            >
              {mode === "demo" ? "Open My people ↗" : "Try demo ↗"}
            </button>
          </div>
          <button
            className="subtle"
            onClick={() => setLeftOpen((v) => !v)}
            aria-label="Find and filter people"
          >
            ⌕ Explore
          </button>
          <button
            className="subtle"
            onClick={() => {
              if (rightOpen && activeTool === "ask") closeTool();
              else showTool("ask");
            }}
          >
            ✧ Ask
          </button>
          <button
            className="subtle radar-button"
            onClick={() => {
              if (rightOpen && activeTool === "radar") closeTool();
              else showTool("radar");
            }}
          >
            ◔ Radar
            {radarItems.length > 0 && <b>{radarItems.length}</b>}
          </button>
          <button
            className="subtle"
            onClick={() => showTool("help")}
            aria-label="How to use SocialWeb"
          >
            ?
          </button>
          <button className="subtle" onClick={() => showTool("settings")}>
            Settings
          </button>
          <button
            className="primary"
            onClick={() => {
              showTool("add");
              setEditing(false);
              setAddPoint(addDrafts[addDraftKey]?.point ?? null);
            }}
          >
            + Add people
          </button>
        </div>
      </header>
      <div
        className={`workspace-grid ${leftOpen ? "" : "left-closed"} ${rightOpen || adding || capturing || settings || help || legend || dumping || radar ? "" : "right-closed"}`}
      >
        <aside className="navigation">
          <div className="navigation-inner">
            <div className="search-box">
              <span>⌕</span>
              <input
                ref={searchRef}
                aria-label="Search people"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  view === "memories"
                    ? "Search memories or names"
                    : "Find your people"
                }
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    view !== "memories" &&
                    filtered[0] &&
                    query.trim()
                  ) {
                    e.preventDefault();
                    select(filtered[0].id);
                  }
                }}
              />
              {query ? (
                <button
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                >
                  ×
                </button>
              ) : (
                <kbd>⌘K</kbd>
              )}
            </div>
            {filtering && view !== "memories" && (
              <section
                className="search-results"
                aria-label="People search results"
              >
                <div className="search-results-heading" role="status">
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "person" : "people"} found
                </div>
                {filtered.length ? (
                  <div className="search-results-list">
                    {filtered.map((p) => (
                      <button
                        key={p.id}
                        className={`search-result ${selected === p.id ? "selected" : ""}`}
                        onClick={() => select(p.id)}
                      >
                        <i style={{ background: colorFor(p.bg) }} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.description ||
                              p.circles.join(" · ") ||
                              "Add a note to remember them"}
                          </small>
                          <em>{groupName(p.bg, graph.bucketNames)}</em>
                        </span>
                        <span
                          className="search-result-arrow"
                          aria-hidden="true"
                        >
                          ↗
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="search-no-results">
                    <p>Try a name, topic, or circle.</p>
                    <button onClick={clear}>Clear filters</button>
                  </div>
                )}
              </section>
            )}
            <div className="nav-label">WORKSPACE</div>
            <nav>
              {(
                [
                  ["map", "◎", "Map · how you know them"],
                  ["doing", "✦", "Doing · what you do together"],
                  ["people", "▦", "Everyone"],
                  ["memories", "≡", "Memories"],
                ] as const
              ).map(([key, icon, label]) => (
                <button
                  key={key}
                  className={`nav-item ${view === key ? "active" : ""}`}
                  onClick={() => setView(key)}
                >
                  <span>{icon}</span>
                  {label}
                  <small>
                    {key === "people"
                      ? graph.nodes.length
                      : key === "memories"
                        ? memories.length
                        : ""}
                  </small>
                </button>
              ))}
            </nav>
            <div className="nav-label">FOCUS ON</div>
            {[
              ["all", "All people"],
              ["highsignal", "✦ High signal"],
              ["highagency", "ϟ High agency"],
              ["important", "◇ Important"],
              ["friends", "♡ Close friends"],
            ].map(([key, label]) => (
              <button
                className={`lens-item ${lens === key ? "active" : ""}`}
                key={key}
                onClick={() => setLens(key)}
              >
                {label}
                <small>
                  {key === "all"
                    ? graph.nodes.length
                    : graph.nodes.filter((p) => p.tags.includes(key)).length}
                </small>
              </button>
            ))}
            <div className="nav-label">
              OVERLAPPING CIRCLES <span>{circles.length}</span>
            </div>
            {circles.length ? (
              circles.map((c) => (
                <button
                  className={`circle-item ${circle === c ? "active" : ""}`}
                  key={c}
                  onClick={() => setCircle((v) => (v === c ? "" : c))}
                >
                  <i style={{ background: colorFor(c) }} />
                  {c}
                  <small>
                    {graph.nodes.filter((p) => p.circles.includes(c)).length}
                  </small>
                </button>
              ))
            ) : (
              <p className="nav-empty">
                Add circles to a profile.
                <br />
                One person can belong to many.
              </p>
            )}
            <div className="nav-label">SPATIAL GROUPS</div>
            {groups.map((g) => (
              <button
                className={`circle-item ${group === g ? "active" : ""}`}
                key={g}
                onClick={() => setGroup((v) => (v === g ? "" : g))}
              >
                <span className="group-icon">◌</span>
                {groupName(g, graph.bucketNames)}
                <small>{graph.nodes.filter((p) => p.bg === g).length}</small>
              </button>
            ))}
          </div>
          <div className="nav-bottom">
            <span className="mini-orbit">R</span>
            <div>
              Your private universe
              <small>
                {graph.nodes.length} people · {groups.length} groups
              </small>
            </div>
            <button
              aria-label="Collapse sidebar"
              onClick={() => setLeftOpen(false)}
            >
              ‹
            </button>
          </div>
        </aside>
        <main className="main-workspace">
          <button
            className="dock-handle left-handle"
            aria-label={
              leftOpen ? "Slide Explore closed" : "Slide Explore open"
            }
            onClick={() => setLeftOpen((v) => !v)}
          >
            {leftOpen ? "‹" : "›"}
          </button>
          <button
            className="dock-handle right-handle"
            aria-label={rightOpen ? "Slide tools closed" : "Slide tools open"}
            onClick={() =>
              rightOpen ? closeTool() : showTool(person ? "profile" : "legend")
            }
          >
            {rightOpen ? "›" : "‹"}
          </button>
          <div className="view-toolbar">
            <div className="view-tabs">
              <button
                className={view === "map" ? "active" : ""}
                onClick={() => setView("map")}
              >
                ◎ Map
              </button>
              <button
                className={view === "doing" ? "active" : ""}
                title="Grouped by what you do together"
                onClick={() => setView("doing")}
              >
                ✦ Doing
              </button>
              <button
                className={view === "people" ? "active" : ""}
                onClick={() => setView("people")}
              >
                ▦ People
              </button>
            </div>
            <div className="active-filters">
              {filtering ? (
                <>
                  <span>
                    {view === "memories"
                      ? filteredMemories.length
                      : filtered.length}{" "}
                    {view === "memories"
                      ? filteredMemories.length === 1
                        ? "memory"
                        : "memories"
                      : "matches"}
                    {circle ? ` · ${circle}` : ""}
                    {group ? ` · ${groupName(group, graph.bucketNames)}` : ""}
                  </span>
                  <button onClick={clear}>Clear filters ×</button>
                </>
              ) : null}
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  void refresh().catch((e) => setError(e.message));
                }}
              >
                Retry
              </button>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {!loaded ? (
            <div className="empty-state">
              <span>✧</span>
              <h2>
                {error
                  ? "Could not load your world."
                  : "Bringing your world into focus…"}
              </h2>
            </div>
          ) : view === "map" ? (
            <div className="map-wrap">
              <RelationshipMap
                key={mode}
                onCreate={(point) => {
                  setAddPoint(point);
                  setAddDrafts((previous) =>
                    previous[addDraftKey]
                      ? {
                          ...previous,
                          [addDraftKey]: {
                            ...previous[addDraftKey],
                            bg: point.bg,
                            point,
                          },
                        }
                      : previous,
                  );
                  showTool("add");
                }}
                graph={graph}
                onLegend={() => showTool("legend")}
                selected={selected}
                matches={matches}
                filtering={filtering}
                onSelect={select}
                focus={focus}
                onGroup={(bg) => {
                  setGroup(bg);
                  setNotice(
                    `Viewing ${groupName(bg, graph.bucketNames)}. Use Settings to rename groups.`,
                  );
                }}
                onMove={async (id, x, y, bg, positions) => {
                  await action(
                    () =>
                      api("people/positions", "POST", {
                        positions: positions.map((p) =>
                          p.id === id ? { ...p, x, y, bg } : p,
                        ),
                      }),
                    "Position and spatial home saved. Circles preserved.",
                  ).catch(() => {});
                }}
                onArrange={async (positions) => {
                  await action(
                    () => api("people/positions", "POST", { positions }),
                    "Group arrangement saved.",
                  ).catch(() => {});
                }}
              />
              {!graph.nodes.length && (
                <div className="map-empty">
                  <span>✧</span>
                  <h2>Start with someone who matters.</h2>
                  <p>
                    A close friend. A creative partner. Someone who opens a
                    door.
                    <br />
                    Your world grows one connection at a time.
                  </p>
                  <button
                    className="primary"
                    onClick={() => {
                      showTool("add");
                      setAddPoint(addDrafts[addDraftKey]?.point ?? null);
                    }}
                  >
                    + Add your first person
                  </button>
                </div>
              )}
            </div>
          ) : view === "doing" ? (
            <div className="map-wrap">
              <RelationshipMap
                key={`${mode}-doing`}
                hint="Drag someone into a circle to add them · Drop outside to remove"
                graph={doing.graph}
                onLegend={() => showTool("legend")}
                selected={
                  person ? doing.key(person, person.circles[0] ?? "") : null
                }
                matches={doingMatches}
                filtering={filtering}
                onSelect={(id) => select(Math.floor(id / SLOTS))}
                focus={focus}
                onGroup={(bg) => {
                  const name = bg.slice(NO_CIRCLE.length);
                  setCircle(name);
                  setNotice(
                    name
                      ? `Showing everyone in ${name}.`
                      : "People with nothing going on yet. Drag one into a circle.",
                  );
                }}
                onMove={async (id, _x, _y, bg) => {
                  const who = graph.nodes.find(
                    (p) => p.id === Math.floor(id / SLOTS),
                  );
                  if (!who) return;
                  const from = doing.names[(id % SLOTS) - 1] ?? "";
                  const to = bg.startsWith(NO_CIRCLE)
                    ? bg.slice(NO_CIRCLE.length)
                    : "";
                  if (to === from && bg.startsWith(NO_CIRCLE)) return;
                  const circles = who.circles.filter((c) => c !== from);
                  if (to && !circles.includes(to)) circles.push(to);
                  await action(
                    () => api(`people/${who.id}`, "PATCH", { circles }),
                    to
                      ? `${who.name} is now in ${to}.`
                      : `${who.name} left ${from || "the circle"}.`,
                  ).catch(() => {});
                }}
                onArrange={async () => {}}
              />
              {!doing.names.length && (
                <div className="map-empty doing-empty">
                  <span>✦</span>
                  <h2>Nothing going on yet.</h2>
                  <p>
                    Open someone and write a line about what you do together, or
                    use Brain dump. Circles appear here as you add them.
                  </p>
                </div>
              )}
            </div>
          ) : view === "people" ? (
            <div className="content-scroll">
              <div className="people-grid">{filtered.map(card)}</div>
              {!filtered.length && (
                <div className="empty-state">
                  <h2>
                    {filtering
                      ? "No people match those filters."
                      : "Your people will appear here."}
                  </h2>
                  <p>
                    {filtering
                      ? "Try a name, circle, or something from their profile."
                      : "Add someone to start your map."}
                  </p>
                  {filtering && <button onClick={clear}>Clear filters</button>}
                </div>
              )}
            </div>
          ) : (
            <div className="content-scroll">
              <div className="memory-feed">
                {filteredMemories.map((m) => (
                  <article className="memory-card" key={m.id}>
                    <div className="label-row">
                      <time>
                        {new Date(m.createdAt).toLocaleString(undefined, {
                          month: "long",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                      <button
                        className="subtle"
                        aria-label="Edit memory"
                        onClick={() => {
                          setMemoryDraft(m);
                          showTool("memory");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="subtle"
                        aria-label="Delete memory"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () => api("memories", "DELETE", { id: m.id }),
                            "Memory deleted. Undo is available.",
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                    <p>{m.body}</p>
                    <div className="chip-row">
                      {m.personIds.map((id) => {
                        const p = graph.nodes.find((p) => p.id === id);
                        return (
                          p && (
                            <button
                              className="chip"
                              key={id}
                              onClick={() => select(id)}
                            >
                              {p.name} ↗
                            </button>
                          )
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
              {!filteredMemories.length && (
                <div className="empty-state">
                  <h2>
                    {memories.length
                      ? "No memories match those filters."
                      : "Save the details you’ll want later."}
                  </h2>
                  <p>
                    {memories.length
                      ? "Try words from a memory or the name of someone linked to it."
                      : "Conversations, ideas, introductions, and things you promised."}
                  </p>
                  {filtering && <button onClick={clear}>Clear filters</button>}
                  {!memories.length && (
                    <button
                      onClick={() => {
                        setMemoryDraft(null);
                        showTool("memory");
                      }}
                    >
                      + Add a memory
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            className="memory-shortcut"
            onClick={() => {
              if (mode === "personal" && ai) return showTool("dump");
              setMemoryDraft(null);
              showTool("memory");
            }}
          >
            {mode === "personal" && ai ? "✎ Brain dump" : "+ Memory"}
          </button>
          <footer className="workspace-footer">
            <span role="status">
              {busy
                ? "Saving…"
                : notice ||
                  (mode === "demo"
                    ? "Fictional demo · Select a star to explore."
                    : "Drag to explore your universe.")}
            </span>
            <button
              disabled={!history || busy || dirtyProfiles.size > 0}
              title={history ? `Undo: ${history}` : "Nothing to undo"}
              onClick={() =>
                (() => {
                  closeTool();
                  run(() => api("history", "POST"), "Last change undone.");
                })()
              }
            >
              ↶ Undo
            </button>
          </footer>
        </main>
        <div className="right-panel">
          <button
            className="close-floating-panel"
            aria-label="Close panel"
            onClick={closeTool}
          >
            ×
          </button>
          {activeTool === "profile" && person ? (
            <PersonEditor
              key={`${mode}-${person.id}`}
              person={person}
              graph={graph}
              memories={memories}
              busy={busy || dirtyProfiles.size > 0}
              onSuggest={
                mode === "personal" && ai
                  ? () =>
                      personalApi("suggest", "POST", { personId: person.id })
                  : undefined
              }
              onPendingChange={(pending) =>
                setDirtyProfiles((previous) => {
                  const next = new Set(previous);
                  if (pending) next.add(person.id);
                  else next.delete(person.id);
                  return next;
                })
              }
              onClose={() => {
                setAdding(false);
                setEditing(false);
                setRightOpen(false);
              }}
              onSelect={select}
              onSave={async (data) => {
                await action(
                  () => api(`people/${person!.id}`, "PATCH", data),
                  "Profile updated.",
                );
              }}
              onDelete={() =>
                run(async () => {
                  await api(`people/${person!.id}`, "DELETE");
                  setEditing(false);
                  setSelected(null);
                }, "Person deleted. Undo restores their profile and connections.")
              }
              onConnect={async (id, weight, remove) => {
                await action(
                  () =>
                    api("edges", remove ? "DELETE" : "POST", {
                      a: person!.id,
                      b: id,
                      weight,
                    }),
                  remove ? "Connection removed." : "Connection saved.",
                ).catch(() => {});
              }}
            />
          ) : activeTool === "ask" && mode === "demo" ? (
            <div className="demo-assistant">
              <span>✧</span>
              <h2>Ask about your universe.</h2>
              <p>
                The demo stays separate from your personal memories. Switch to
                My people to ask Claude about people you actually know.
              </p>
              <button onClick={switchMode}>Open My people</button>
            </div>
          ) : null}
          {mode === "personal" && (
            <div
              className="assistant-session"
              hidden={!rightOpen || activeTool !== "ask"}
            >
              <AssistantPanel
                people={graph.nodes}
                selectedId={selected}
                onSelect={select}
                ai={ai}
                seed={askSeed}
              />
            </div>
          )}
          {legend && <MapKey graph={graph} onClose={closeTool} />}
          {radar && (
            <TodayPanel
              nudges={radarItems}
              ai={mode === "personal" && ai}
              onSelect={select}
              onClose={closeTool}
              onAsk={(question) => {
                setAskSeed({ token: Date.now(), question });
                showTool("ask");
              }}
            />
          )}
          {dumping && (
            <CapturePanel
              text={dumpText}
              onTextChange={setDumpText}
              onClose={closeTool}
              onPreview={async (text) =>
                (
                  (await personalApi("capture", "POST", {
                    text,
                    preview: true,
                  })) as { people: FiledItem[] }
                ).people
              }
              onApply={async (text, items) => {
                await action(
                  () => personalApi("capture", "POST", { text, items }),
                  `Filed onto ${items.length} ${items.length === 1 ? "profile" : "profiles"}. Undo reverses it.`,
                );
                setDumpText("");
                closeTool();
              }}
            />
          )}
          {adding && (
            <QuickAdd
              key={addDraftKey}
              externalBusy={busy}
              draft={addDrafts[addDraftKey]}
              onDraftChange={(draft) =>
                setAddDrafts((previous) => ({
                  ...previous,
                  [addDraftKey]: { ...draft, point: addPoint },
                }))
              }
              onDiscardDraft={() => {
                setAddDrafts((previous) => {
                  const next = { ...previous };
                  delete next[addDraftKey];
                  return next;
                });
                setAddPoint(null);
                closeTool();
              }}
              initialBg={addPoint?.bg}
              graph={graph}
              onClose={closeTool}
              onSave={async (people) => {
                await action(
                  () =>
                    api("people/batch", "POST", {
                      people: people.map((p, i) => ({
                        ...p,
                        ...(addPoint
                          ? {
                              x: addPoint.x + (i % 5) * 65,
                              y: addPoint.y + Math.floor(i / 5) * 65,
                            }
                          : {}),
                      })),
                    }),
                  `${people.length} ${people.length === 1 ? "person" : "people"} added.`,
                );
                setAddDrafts((previous) => {
                  const next = { ...previous };
                  delete next[addDraftKey];
                  return next;
                });
                if (toolRef.current.activeTool === "add") closeTool();
              }}
            />
          )}
          {capturing && (
            <MemoryComposer
              key={memoryDraftKey}
              externalBusy={busy}
              draft={memoryDrafts[memoryDraftKey]}
              onDraftChange={(draft) =>
                setMemoryDrafts((previous) => ({
                  ...previous,
                  [memoryDraftKey]: draft,
                }))
              }
              onDiscardDraft={() => {
                setMemoryDrafts((previous) => {
                  const next = { ...previous };
                  delete next[memoryDraftKey];
                  return next;
                });
                closeTool();
              }}
              localOnly={mode === "demo"}
              memory={memoryDraft}
              people={graph.nodes}
              selectedId={selected}
              ai={ai}
              onClose={closeTool}
              onCreatePerson={async (name) => {
                let id = 0;
                await action(async () => {
                  const result = await api("people", "POST", { name });
                  id = result.id;
                }, "Person created. Review their details after saving the memory.");
                return id;
              }}
              onSave={async (body, personIds) => {
                await action(
                  () =>
                    api("memories", memoryDraft ? "PATCH" : "POST", {
                      body,
                      personIds,
                      ...(memoryDraft ? { id: memoryDraft.id } : {}),
                    }),
                  "Memory saved.",
                );
                setMemoryDrafts((previous) => {
                  const next = { ...previous };
                  delete next[memoryDraftKey];
                  return next;
                });
                if (
                  toolRef.current.activeTool === "memory" &&
                  toolRef.current.memoryDraftKey === memoryDraftKey
                )
                  closeTool();
              }}
            />
          )}
          {settings && (
            <div className="dock-tool-wrapper">
              <section
                className="dock-tool settings-modal"
                role="region"
                aria-labelledby="settings-title"
              >
                <header>
                  <h2 id="settings-title">Your workspace</h2>
                  <button onClick={closeTool} aria-label="Close settings">
                    ×
                  </button>
                </header>
                {mode === "demo" && (
                  <p className="demo-settings">
                    Fictional demo · changes stay in this browser.{" "}
                    <button
                      onClick={() => {
                        resetDemo();
                        void refresh();
                      }}
                    >
                      Reset demo
                    </button>
                  </p>
                )}
                <h3>Claude</h3>
                <p>
                  {ai
                    ? "Connected using your server-side API key."
                    : "Add ANTHROPIC_API_KEY to .env.local, then restart the app. Your key stays on the server."}
                </p>
                <h3>Spatial groups</h3>
                <div className="settings-groups">
                  {groups.map((g) => (
                    <div className="inline-input" key={g}>
                      <input
                        aria-label={`Rename ${groupName(g, graph.bucketNames)}`}
                        defaultValue={groupName(g, graph.bucketNames)}
                        onBlur={(e) => {
                          if (
                            e.target.value.trim() &&
                            e.target.value !== groupName(g, graph.bucketNames)
                          )
                            run(
                              () =>
                                api(
                                  `buckets/${encodeURIComponent(g)}`,
                                  "PATCH",
                                  {
                                    name: e.target.value,
                                  },
                                ),
                              "Group renamed.",
                            );
                        }}
                      />
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api(`buckets/${encodeURIComponent(g)}`, "DELETE"),
                            "Group dissolved. People moved to Unsorted; circles preserved.",
                          )
                        }
                      >
                        Dissolve
                      </button>
                    </div>
                  ))}
                </div>
                <h3>Group connections</h3>
                {graph.clusterEdges.map((edge) => (
                  <div className="connection-row" key={`${edge.a}-${edge.b}`}>
                    <span>
                      {groupName(edge.a, graph.bucketNames)} ↔{" "}
                      {groupName(edge.b, graph.bucketNames)}
                    </span>
                    <input
                      aria-label="Group connection strength"
                      type="number"
                      min="0"
                      max="10"
                      defaultValue={edge.weight}
                      onBlur={(e) => {
                        const weight = Number(e.target.value);
                        if (weight !== edge.weight)
                          run(
                            () =>
                              api("cluster-edges", "PATCH", {
                                bgA: edge.a,
                                bgB: edge.b,
                                weight,
                              }),
                            "Group connection saved.",
                          );
                      }}
                    />
                    <button
                      disabled={busy}
                      aria-label="Remove group connection"
                      onClick={() =>
                        run(
                          () =>
                            api("cluster-edges", "DELETE", {
                              bgA: edge.a,
                              bgB: edge.b,
                            }),
                          "Group connection removed.",
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="inline-input">
                  <select
                    aria-label="First group"
                    value={linkA}
                    onChange={(e) => setLinkA(e.target.value)}
                  >
                    <option value="">First group…</option>
                    {groups
                      .filter((g) => graph.nodes.some((n) => n.bg === g))
                      .map((g) => (
                        <option key={g} value={g}>
                          {groupName(g, graph.bucketNames)}
                        </option>
                      ))}
                  </select>
                  <select
                    aria-label="Second group"
                    value={linkB}
                    onChange={(e) => setLinkB(e.target.value)}
                  >
                    <option value="">Second group…</option>
                    {groups
                      .filter(
                        (g) =>
                          g !== linkA && graph.nodes.some((n) => n.bg === g),
                      )
                      .map((g) => (
                        <option key={g} value={g}>
                          {groupName(g, graph.bucketNames)}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label="Group connection weight"
                    type="number"
                    min="0"
                    max="10"
                    value={linkWeight}
                    onChange={(e) => setLinkWeight(Number(e.target.value))}
                  />
                  <button
                    disabled={busy || !linkA || !linkB || linkA === linkB}
                    onClick={() =>
                      run(
                        () =>
                          api("cluster-edges", "POST", {
                            bgA: linkA,
                            bgB: linkB,
                            weight: linkWeight,
                          }),
                        "Group connection saved.",
                      )
                    }
                  >
                    Link
                  </button>
                </div>
                {mode === "personal" && (
                  <>
                    <h3>Backup & recovery</h3>
                    <p>
                      Export includes profiles, circles, memories, connections,
                      and map positions. Restore replaces your workspace and can
                      be undone.
                    </p>
                    <div className="settings-actions">
                      <a className="button" href="/api/snapshot" download>
                        ↓ Export backup
                      </a>
                      <button
                        onClick={() => importRef.current?.click()}
                        disabled={busy}
                      >
                        ↑ Restore backup
                      </button>
                      <input
                        type="file"
                        accept="application/json,.json"
                        ref={importRef}
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const data = JSON.parse(await file.text());
                            if (
                              window.confirm(
                                "Replace this workspace with the selected backup? Undo will be available.",
                              )
                            )
                              run(
                                () => api("snapshot", "POST", data),
                                "Backup restored.",
                              );
                          } catch {
                            setError("Could not read that JSON backup.");
                          }
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </>
                )}
                <h3>Local for now</h3>
                <p>
                  This version stores your data on this computer. Web deployment
                  needs a persistent database and private sign-in before it is
                  ready for your personal information.
                </p>
              </section>
            </div>
          )}
          {help && (
            <div className="dock-tool-wrapper">
              <section
                className="dock-tool"
                role="region"
                aria-labelledby="help-title"
              >
                <header>
                  <h2 id="help-title">A map with meaning.</h2>
                  <button aria-label="Close help" onClick={closeTool}>
                    ×
                  </button>
                </header>
                <div className="help-grid">
                  <article>
                    <b>01 / Spatial homes</b>
                    <p>
                      Drag someone inside a group’s boundary to move them into
                      it. Drop them outside all groups to give them a separate
                      home. Drag a boundary to move the whole group.
                    </p>
                  </article>
                  <article>
                    <b>02 / Overlapping circles</b>
                    <p>
                      People can be creators, UT friends, and startup
                      collaborators at once. Add circles in their profile.
                      Filters highlight them without moving the map.
                    </p>
                  </article>
                  <article>
                    <b>03 / Your judgment</b>
                    <p>
                      ✦ High signal and ϟ high agency are labels you assign.
                      Node size and a 1–5 badge show closeness; ring segments
                      show every circle. Lines represent explicit connections.
                      Group placement is an arrangement, not a score.
                    </p>
                  </article>
                  <article>
                    <b>04 / Remember effortlessly</b>
                    <p>
                      Add one name, paste a list, or double-click empty space.
                      Save memories and ask Claude about what you’ve saved. Undo
                      recovers the last 25 changes.
                    </p>
                  </article>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
