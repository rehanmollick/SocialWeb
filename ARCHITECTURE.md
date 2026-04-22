# SocialWeb — Cluster & Physics Architecture

## Core Mental Model

You are the center (origin 0,0). People orbit you in **clusters** (groups sharing a
`bg` field in the database). Each cluster gets a haze (colored mist), a name label,
and a rope (line from you to the cluster). The simulation arranges people into
geometric formations within their cluster using a triangular lattice.

---

## Node Lifecycle States

| State | `_pinned` | `fx/fy` | `_ax/_ay` | Meaning |
|-------|-----------|---------|-----------|---------|
| Fresh (from DB, no saved pos) | false | null | set by layoutBucket | Physics controls placement |
| Fresh (from DB, has saved pos) | true | null | set to saved x,y | Anchored to saved position |
| Being dragged | - | set to mouse pos | unchanged | User is moving the node |
| Just dropped | true | null | set to drop pos | Anchored where user released |
| In active cluster | true/false | null | set by shapeForce (if !pinned) | Lattice slot or saved pos |

---

## Cluster Assignment — Two Systems

### 1. Persistent: `node.bg` (stored in DB)
- The canonical cluster a node belongs to
- Set on creation (defaults to nearest cluster)
- Changed by handleDrop when a node is moved to a new cluster
- Persisted via PATCH /api/people/:id

### 2. Ephemeral: `node._liveBg` (computed every tick)
- The VISUAL cluster a node currently belongs to
- Used for: haze rendering, shape force, rope grouping
- Computed by computeLiveComponents() every simulation tick
- Can differ from `bg` when hazes overlap or nodes are in transit

### Why two systems?
- `bg` is the ground truth. It persists across reloads.
- `_liveBg` handles split clusters (same bg, physically separated groups)
  and cross-bg merging (different bgs, physically adjacent nodes).

---

## computeLiveComponents() — How Clusters Form

Runs every simulation tick. Three phases:

### Phase 1: Haze Capture
For each node, check if it sits inside any existing visible haze:
- Threshold: `distance < haze.radius * 0.85` AND `haze.alpha >= 0.08`
- Closest haze wins
- Result: node._liveBg = haze key

This means **existing clusters are "sticky"** — once a haze is visible, it
captures nearby nodes regardless of their bg. This is correct: the haze IS
the cluster boundary.

### Phase 2: Union-Find (same bg, free nodes only)
Nodes not captured by any haze are "free." Group free nodes by bg, then
union-find within each bg group using LINK_DIST (190px) proximity:
- Connected components get unique keys: `bg`, `bg#2`, `bg#3`, ...
- This handles: nodes that share a bg but are physically split into
  multiple groups (e.g., half the "online" cluster dragged away)

### Phase 3: Cross-BG Solo Merge
Solo free nodes (component of 1) from different bgs that are within
LINK_DIST of each other merge under one shared _liveBg:
- This handles: two individually-dragged nodes from different clusters
  that the user placed near each other

---

## Haze — How Clusters Become Visible

Each _liveBg component with 2+ nodes gets a haze. Per tick:

```
alive = total >= 2 AND non-dragged-count >= 1
spread = 80th-percentile distance from centroid (trimmed for outliers)
targetRadius = max(110, spread * 1.4 + 70)
targetAlpha = min(0.95, compactness * 0.32)
compactness = (total + 0.8) / (1 + spread / 130)
```

Lerp: grow fast (0.14), shrink slow (0.05). Dead hazes fade and get deleted.

**Key**: A single node NEVER produces a haze. You need 2+ nodes.

---

## Shape Force — Triangular Lattice

Nodes inside a cluster are gently pulled toward slots on a triangular lattice:

- **SPACING = 46px** between adjacent lattice points
- Center is skipped (kept clear for click-to-edit label)
- Shells fill outward: 6 neighbors → 12 → 18 → ...
- Partial shells distribute evenly by angle

| Nodes | Formation |
|-------|-----------|
| 1 | No formation (self-anchor) |
| 2 | Pair on opposite sides (first shell, 180 apart) |
| 3 | Equilateral triangle (first shell, every-other) |
| 4-6 | Partial/full hexagon |
| 7-12 | Hexagon + second ring |
| 13+ | Growing hex rings |

**Only non-pinned nodes** participate in shapeForce. Pinned nodes stay at
their drop position.

---

## Anchor Force — What Holds Nodes in Place

Every tick, anchorForce pulls nodes toward their `_ax/_ay` target:
- `k = 0.55` for pinned nodes (strong — they stay where dropped)
- `k = 0.04` for unpinned nodes (gentle — physics can still move them)

---

## handleDrop() — What Happens When You Release a Drag

### Input
Array of moved nodes (1 for single drag, N for group drag)

### Step 1: Pin All Moved Nodes
```
_pinned = true
_ax = current x, _ay = current y
fx = null, fy = null (release from simulation pinning)
```

### Step 2: Determine Destination Cluster

**Group path** (2+ nodes moved together):
1. Compute group centroid
2. Is centroid inside a foreign haze? (threshold: r * 0.7) → adopt that haze's bg
3. Is centroid still inside the majority's original haze? (threshold: r * 0.5) → keep original bg
4. Is any moved node near a non-moved node? (< LINK_DIST) → adopt that node's bg
5. Otherwise → generate new bg: `c${Date.now()}`
6. ALL nodes in the group get the SAME bg

**Single node path**:
1. Is node inside a foreign haze? (threshold: r * 0.7) → adopt
2. Is node still inside own haze? (threshold: r * 0.5) → keep
3. Is node near any non-moved, different-bg node? (< LINK_DIST) → adopt
4. Otherwise → new bg

### Step 3: Relayout Affected Clusters
For each bg that gained/lost members, call layoutBucket to recompute
polygon slots for remaining unpinned nodes.

### Step 4: Persist
Save all moved + affected node positions to DB via onSavePositions.

---

## User Actions & What They Trigger

### Click node
→ Open node detail panel

### Click cluster center (named)
→ Open cluster name edit popup

### Click cluster center (unnamed)
→ Open cluster name edit popup (empty)

### Drag single node
→ Move node, handleDrop on release, possible cluster reassignment

### Cmd/Ctrl + drag (box select)
→ Draw marquee, select all nodes inside

### Drag a selected node (with multi-selection active)
→ Group drag ALL selected nodes together, handleDrop on release

### Alt + click empty space
→ Create new person node at that position, assigned to nearest cluster

### Shift + drag node to node
→ Create edge between two people

### Shift + drag from origin to node
→ Pin/connect node directly to "you"

### Shift + drag cluster to cluster
→ Create cluster-level connection

---

## Edge Cases & How They Should Be Handled

### EC1: Box-select large group, move to empty area
**Expected**: ALL moved nodes form ONE cluster with ONE haze.
**Mechanism**: Group handleDrop assigns same bg to all. computeLiveComponents
groups them. Haze appears once 2+ settle.

### EC2: Drag 2 nodes out individually to same spot
**Expected**: They form a cluster together.
**Mechanism**: First node gets new bg. Second node's handleDrop finds first
node within LINK_DIST → adopts first's bg. Both share bg → cluster forms.
**Fallback**: If bgs differ, cross-bg solo merge in computeLiveComponents
gives them same _liveBg → haze appears.

### EC3: Drag node slightly within its own cluster
**Expected**: Node stays in cluster, just repositioned.
**Mechanism**: inOwnHaze check (r * 0.5). If still inside → bg unchanged.

### EC4: Cluster loses all but 1 node
**Expected**: Haze fades away, lone node floats.
**Mechanism**: total < 2 → haze ramps down → eventually deleted.

### EC5: Two clusters' hazes overlap
**Expected**: Each node goes to the closest haze.
**Mechanism**: Phase 1 picks closest haze by d2.

### EC6: Node dragged into foreign cluster's haze
**Expected**: Node joins that cluster.
**Mechanism**: handleDrop finds foreign haze hit → changes bg.

### EC7: Name a cluster, reload page
**Expected**: Name persists.
**Mechanism**: Name saved to bucket_names by baseBg (strip # suffix).
Label renderer falls back: bucketNames[key] || bucketNames[baseBg].

### EC8: Dissolve vs Delete a cluster
**Dissolve**: Moves all nodes to "online" (default), removes cluster name/rope.
People and edges preserved.
**Delete all**: Permanently removes all nodes, edges, and cluster data.
**Mechanism**: Dissolve = PATCH each person's bg + DELETE bucket_names.
Delete = DELETE /api/buckets/{bg}?withPeople=1 → cascades.

### EC9: Box-select moves nodes but they spread across LINK_DIST
**Expected**: Still ONE cluster.
**Mechanism**: Group handleDrop seeds hazeState immediately with a radius
covering all dropped nodes. Phase 1 captures all members on tick 1.
Group-dropped nodes are unpinned so shapeForce settles them into lattice.

### EC10: Click cluster center vs click node near center
**Expected**: Clicking the center area opens cluster popup, not selects a node.
**Mechanism**: Drag subject returns null if click is within CLUSTER_CENTER_HIT_R
of any haze center. Center-repulsion (MIN_CENTER_R=38, push=0.15) keeps nodes
well outside the click zone.

### EC11: Hide rope, then want to show it again
**Expected**: Hidden ropes appear in a "hidden ropes" list in the HUD.
**Mechanism**: Controls HUD shows hidden ropes with a "show" button that
patches meHidden=false via the bucket API.

---

## LLM Integration

### Command Bar (bottom input)
Sends text to /api/command → Claude Haiku with 12 tools:
- **log_thought**: Journal entry, auto-extracts people
- **connect_people / disconnect_people**: Peer edges
- **add_tag / remove_tag**: Tag management
- **set_strength**: Person's closeness (0-10)
- **set_background**: Move person to any cluster (preset or dynamic)
- **rename_cluster**: Give cluster a display name
- **delete_person**: Remove from graph
- **connect_cluster / disconnect_cluster**: Interconnect/clear all edges in cluster
- **pin_to_me / unpin_from_me**: Direct line toggle

Claude receives a full graph snapshot (all people, clusters, tags, strengths)
so it can resolve names, match display names to bucket ids, and make
informed decisions. Up to 4 tool-calling turns per request.

### Ask Panel (right sidebar)
Sends question to /api/ask → Claude answers based on people data + recent
journal entries. Returns referenced people for highlighting.
