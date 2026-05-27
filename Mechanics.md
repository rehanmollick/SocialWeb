# SocialWeb — Mechanics Spec

The canonical reference for how the graph behaves. If the code disagrees with this
doc, the doc is the intent and the code is the bug.

## Mental model

You are the origin `(0, 0)`. People (nodes) live in **clusters**. A cluster is a
group of people who share a `bg` (background) field — it's the "where do I know
them from" axis (Plano East, UT, climbing gym, online, etc).

Clusters are visualized as a **haze** (soft colored mist) with a label, a rope
(line from you to its center), and a triangular-lattice arrangement of members
around an empty center.

There are two coordinate systems in the data model:

| | Persistent (`bg`) | Live (`_liveBg`) |
|---|---|---|
| Source | Database `people.bg` | Computed every sim tick |
| Survives reload | yes | no |
| Changed by | drag-to-new-cluster, `/api/command` LLM tools, dissolve | every `computeLiveComponents()` run |
| Used for | ground truth, dissolve, save | shape force, haze, rope grouping |

`bg` is the **answer**. `_liveBg` is the current **visual approximation**.

---

## Cluster identity rules

A cluster's identity is its **base bg** (the `bg` string without any `#N` suffix).
The base bg is what the user sees as "the cluster." When the cluster has a name
in `bucketNames`, that's its display label.

`_liveBg` may differ from `bg` because of physical layout:
- A `bg` can be visually split if its members are physically far apart →
  `_liveBg` will be `bg`, `bg#2`, `bg#3`, …
- Two solo nodes of *different* `bg`s sitting next to each other can share a
  single `_liveBg` (cross-bg merge for transient drag-out behavior).

**Sub-keys (`bg#N`) are an internal representation detail.** They must never be
exposed in user actions. When the user clicks PKP#2 thinking it's PKP, the
system must treat it as PKP — count all PKP members, dissolve all PKP members,
etc.

---

## Named vs unnamed clusters

A cluster is **named** if `bucketNames[baseBg]` exists.

| | Named | Unnamed |
|---|---|---|
| Splitting (Phase 2) | NEVER. All members stay under base key, regardless of physical spread. | Allowed when members drift > `LINK_DIST`. |
| Why | The user explicitly declared this is one group. Splitting it is a UX bug. | Speculative grouping; OK to fragment. |
| Dissolve | Removes the name AND moves all members to `online`. | Same. |

The "named clusters are indivisible" rule is the single most important
invariant. It prevents the "PKP has 3 nested hazes" bug.

---

## computeLiveComponents() — the three phases

Runs every tick before sim integration. Outputs each node's `_liveBg`.

### Constants

| | Value | Meaning |
|---|---|---|
| `LINK_DIST` | 260 wu | Two same-bg nodes within this distance belong to the same component. Was 190 — bumped because lattice spacing grew. |
| `MERGE_RADIUS` | 320 wu | After Phase 2, two same-bg components whose centroids are within this merge back. |
| `ABSORB_RADIUS` | 600 wu | Used by dissolve: a dissolving node joins the nearest other cluster within this range, else falls back to `online`. |
| Haze capture | `d < 0.85 * st.r` | Phase 1 threshold. |
| Capturing haze | `st.a >= 0.08` | Only visible hazes capture. |

### Phase 1 — Haze capture
For each node: find the *closest* visible haze (`a >= 0.08`) whose interior
contains the node (`distance < 0.85 * r`). If found, `_liveBg = haze key`.
Else: free.

### Phase 2 — Union-find on free same-bg nodes
For each `bg`:
1. **If the bg is named** (`bucketNames[bg]` exists): assign ALL free same-bg
   nodes to key `bg`. No union-find, no `#N` suffixes.
2. **Otherwise**: union-find by `LINK_DIST` proximity. Connected components
   become `bg`, `bg#2`, `bg#3`, … (reusing indices not currently held by an
   active haze).
3. **Merge-back pass**: for unnamed bgs with multiple components, compute each
   component's centroid. Any pair within `MERGE_RADIUS` → merge into the lower-
   indexed component.

### Phase 3 — Cross-bg solo merge
Free nodes that ended up alone (component of 1) from different bgs but within
`LINK_DIST` of each other share a `_liveBg`. This handles the "I dragged out
two random nodes and put them next to each other" case.

---

## Haze (`hazeState`)

A `Record<key, { x, y, r, a }>` keyed by `_liveBg`. Per frame, for each live
`_liveBg` component with ≥ 2 nodes:

- centroid → target `(x, y)`
- 80th-percentile distance from centroid (trimmed for outliers) → target `r`
- compactness → target `a` (max 0.95)
- Lerp: grow 0.14, shrink 0.05.

Hazes for keys with **no live nodes**: alpha decays at 0.08/frame.
Once `a < 0.005`: `delete hazeState[key]`.

**Aggressive cleanup on dissolve**: when AppPage dissolves a cluster, the
canvas should immediately set all entries matching `^baseBg(#\d+)?$` to
`a = 0` so they get deleted on the next frame instead of fading for ~60
frames. This is the only "imperative" haze operation in the system.

---

## handleDrop — what happens when a drag ends

Called with the array of moved nodes (1 for single, N for group).

Per node:
1. `_pinned = true`, `_ax/_ay = current pos`, `fx/fy = null`, `vx/vy = 0`.

Cluster reassignment:

**Group of 2+ nodes:**
1. Compute group centroid.
2. **Whole-cluster move detection**: if ALL nodes of the majority bg in the
   moved set, and the majority bg has at least 2 movers → keep original bg,
   just reseed haze at new centroid.
3. Else: closest foreign haze whose `(r*0.7)` interior contains centroid →
   adopt that bg.
4. Else: still inside own bg's haze at `r*0.5` → keep.
5. Else: any moved node within `LINK_DIST` of any non-moved node → adopt that
   non-moved node's bg.
6. Else: new bg `c${Date.now()}`.

**Single node:** same as 2–6, scoped to the one node.

All moved nodes in a group get the **same** final bg.

---

## User actions

| Action | Effect |
|---|---|
| Click node | Open detail drawer |
| Click cluster center (any sub-key) | Cluster name popup. **memberIds = all nodes where `n.bg === baseBg`** (NOT `_liveBg === hitBg`). Count shows total bg members. |
| Click rope (you → cluster) | Same as above — pass base-bg members, not `_liveBg` members |
| Click empty | Deselect |
| Drag node | Move node, on release: handleDrop |
| Cmd+drag (no hit) | Box-select marquee |
| Cmd+drag (on selected) | Group drag |
| Drag selected node (single drag handler) | Group drag if node is in current selection |
| Alt+click empty | Create person at cursor, bg = nearest cluster center |
| Shift+drag node→node | Create edge |
| Shift+drag origin→node | Pin direct line to you |
| Shift+drag cluster→cluster | Create cluster-level connection |
| C+wheel (with multi-selection) | Spread / contract selection about its centroid |
| Wheel/pinch | Zoom (camera) |

---

## Dissolve vs Delete

| | Dissolve | Delete |
|---|---|---|
| API | PATCH each person `bg=<absorption-target>`, DELETE `/api/buckets/{baseBg}` | DELETE on each person, DELETE `/api/buckets/{baseBg}` |
| People | Preserved, each absorbed by nearest cluster (or → `online`) | Permanently deleted |
| Edges | Preserved | Cascaded delete |
| Cluster name | Removed | Removed |
| Saved positions | Cleared (so the moved nodes lay out fresh in their new cluster) | N/A |
| Canvas haze cleanup | Wipe all `baseBg` and `baseBg#N` entries from `hazeState` | Same |

**Both flows operate on the FULL base-bg member set**, not the per-sub-cluster
member set. AppPage looks up `g.nodes.filter(n => n.bg === baseBg)` before
calling the API, ignoring whatever subset the canvas passed in. If that returns
empty for any reason (stale popup state, etc.), it falls back to the popup's
memberIds as a safety net.

### Absorption rule (dissolve only)

When a cluster dissolves, each member is not just dumped into `online`. The
canvas's `absorbDissolvingNodes(baseBg, ids)` API picks a destination per node:

1. **For each dissolving node**: scan visible-enough haze centers
   (`a >= 0.10`, base keys only — sub-keys excluded). Exclude the dissolving
   cluster's own base key.
2. **Pick the nearest center within `ABSORB_RADIUS = 600 wu`**. That cluster
   becomes the node's new bg.
3. **If no candidate is within range**, the node falls back to `bg='online'`.

This means dissolving a cluster sitting amid other clusters causes its
members to scatter into those neighbors, not flock back to the `online`
default. Dissolving an isolated cluster sends everyone to `online` as before.

`ABSORB_RADIUS = 600` is intentionally larger than `LINK_DIST = 260` so the
rule is "if there's a real haze in the neighborhood, join it" rather than
"only if you're already touching it."

---

## applyGraph — pin/unpin invariant

When the server sends a node with `x/y = null` (e.g., after dissolve cleared
its position), `applyGraph` MUST unpin the corresponding SimNode (`_pinned =
false`, `_ax = _ay = undefined`, `fx = fy = null`). Otherwise `layoutBucket`
filters the node out of its placement pass (it only places `!_pinned` nodes)
and the node stays glued to its old position even though its `bg` changed —
the "dissolve does nothing visually" bug.

The general rule: `_pinned` is sticky across re-renders ONLY as long as a
saved position is supplied. A null position is the server's signal to release
the anchor.

---

## Edge-case checklist (each must hold)

1. Box-select 12 nodes → drag to empty space → form ONE cluster with ONE haze.
2. Drag a named cluster from one area to another → name persists, ONE haze
   stays, no sub-clusters appear during or after the move.
3. Click any visible haze of a named cluster (even if it's a sub-piece) →
   popup shows ALL members of that name. Dissolve removes ALL.
4. Dissolve a cluster → the haze disappears within ~2 frames, not ~60.
5. Two clusters' hazes overlap → each node belongs to its closest haze.
6. Drag a node into a foreign cluster's haze → bg changes; old haze shrinks
   (loses one member); new haze grows (gains one).
7. Spread a cluster's members past `LINK_DIST` with C+wheel → **named**
   clusters stay one haze; **unnamed** ones may visually split but merge back
   if centroids end up within `MERGE_RADIUS`.
8. Rename a cluster → name persists across reload (`bucket_names` table by
   `baseBg`).
9. Delete every person but one in a cluster → haze fades, lone dot floats.
10. Hide a rope from the controls HUD → the rope's row appears in "hidden
    ropes" list with a "show" button.

---

## LLM integration

Two endpoints:

- `POST /api/command` — sends user text to Claude Haiku with 12 tools
  (log_thought, connect_people, disconnect_people, add_tag, remove_tag,
  set_strength, set_background, rename_cluster, delete_person,
  connect_cluster, disconnect_cluster, pin_to_me, unpin_from_me).
  Up to 4 tool-calling turns per request. Claude sees the full graph
  snapshot.
- `POST /api/ask` — Q&A over people + recent journal entries. Returns
  referenced people for highlighting.

---

## Rendering performance

The decoration layer is large: ~4000 stars, 900 dust motes, ~150 galaxies,
100 planets, 700 asteroids, 9 asteroid belts (~2500 rocks), 36 comets, etc.
Drawing all of them every frame was the cause of the laggy drag/zoom/pan.

**Every decoration loop in the draw function must cull by the view rect**
before doing any work. The helpers `inView(x, y, margin)` and `ringInView(r)`
are computed once per frame at the top of `draw` and applied as:

```ts
for (const item of items) {
  if (!inView(item.x, item.y, item.radius)) continue;
  // draw...
}
```

Asteroid belts: cull the whole belt by `(belt.cx, belt.cy)` ± `belt.rOuter`
first, then cull individual rocks. This saves ~280 arcs per culled belt.

Orbiters: cull by `ringInView(orbit.radius)` first (skip entire orbit ring
if it doesn't intersect the view), then by per-orbiter position.

Don't cull: shooting stars (cheap, transient), people nodes, edges, ropes,
the canvas background gradient.

When adding new decoration, the rule is: **if you're drawing > 20 of
something per frame, cull it.**

| File | Role |
|---|---|
| `app/canvas.tsx` | All rendering + physics + cluster computation |
| `app/components/AppPage.tsx` | Main UI shell, dissolve/delete dispatch, drawer, popups |
| `app/api/people/[id]/route.ts` | Person CRUD (PATCH for bg, strength, tags, position) |
| `app/api/people/positions/route.ts` | Batch save positions after drop |
| `app/api/buckets/[bg]/route.ts` | Bucket name CRUD + dissolve/delete cascade |
| `app/api/command/route.ts` | LLM command bar |
| `app/api/ask/route.ts` | LLM Q&A |
| `lib/db/*` | Drizzle schema + connection |

---

*If you change cluster behavior, update this file in the same commit.*
