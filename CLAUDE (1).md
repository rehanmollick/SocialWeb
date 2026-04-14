# Social Web — Personal Social Graph Explorer

REMEMBER TO COMMIT EARLY AND COMMIT OFTEN AND PUSH. 

## Project Overview
Social Web is a personal social network visualization and tracking tool. The user (Rehan) is always the center node. People he knows are nodes radiating outward, clustered by social context (hometown, school, org, etc.). Connections between people are visualized as typed edges. An AI layer (Claude API) powers natural language node/connection creation and auto-categorization.

**Core Problem:** Despite being highly social, the user keeps encountering the same people. Social Web maps the full social graph to identify untapped clusters, bridge connectors, and dead zones — turning social expansion into a strategy.

## Tech Stack
- **Framework:** Next.js 15 (App Router, TypeScript)
- **Graph Visualization:** `react-force-graph-2d` (d3-force under the hood) with custom Canvas rendering
- **State Management:** Zustand with immer middleware
- **Persistence:** Dexie.js (IndexedDB wrapper) — local-first, no backend
- **Styling:** Tailwind CSS v4 + CSS variables for theming
- **Animation:** Framer Motion for UI panels/overlays; Canvas animations for graph effects
- **AI Integration:** Anthropic SDK via Next.js API routes (`/api/ai/*`)
- **Fonts:** Load via `next/font` — JetBrains Mono for node labels/data, Space Grotesk or Outfit for UI chrome/headings

## Architecture

```
src/
├── app/
│   ├── layout.tsx              # Root layout, font loading, providers
│   ├── page.tsx                # Main app shell — graph canvas + overlay panels
│   └── api/
│       └── ai/
│           ├── categorize/route.ts   # AI: categorize a person into groups
│           ├── parse-input/route.ts  # AI: parse natural language into structured node/edge data
│           ├── reeval/route.ts       # AI: re-evaluate a person's placement given new info
│           ├── react-to-change/route.ts # AI: react to manual connections/changes, suggest reorg
│           ├── pathfinder/route.ts      # AI: six degrees pathfinding to reach target people
│           └── suggest/route.ts      # AI: suggest connections, bridge scores, insights
├── components/
│   ├── graph/
│   │   ├── GraphCanvas.tsx          # react-force-graph-2d wrapper, custom node/link rendering
│   │   ├── NodeTooltip.tsx          # Hover tooltip for nodes
│   │   ├── NodeContextMenu.tsx      # Right-click menu for nodes
│   │   └── LinkContextMenu.tsx      # Right-click menu for edges
│   ├── background/
│   │   ├── SpaceBackground.tsx      # Orchestrates all background layers
│   │   ├── StarField.tsx            # 3-layer parallax star field (Canvas)
│   │   ├── NebulaClouds.tsx         # Drifting gradient blobs (CSS)
│   │   ├── ShootingStars.tsx        # Random streaking light animations (CSS)
│   │   ├── AstralGeometry.tsx       # Subtle sacred geometry patterns (SVG)
│   │   └── CosmicDust.tsx           # Brownian motion particle field (Canvas)
│   ├── panels/
│   │   ├── CommandBar.tsx           # Main input — natural language AI bar (Cmd+K style)
│   │   ├── PersonPanel.tsx          # Side panel: view/edit person details
│   │   ├── PathfinderPanel.tsx      # Six degrees pathfinder UI — target input, path visualization, strategy
│   │   ├── LegendPanel.tsx          # Bottom-right legend: connection types + node colors
│   │   ├── GroupPanel.tsx           # Manage groups/clusters
│   │   ├── SettingsPanel.tsx        # Edit color meanings, connection types, preferences
│   │   └── FilterBar.tsx            # Filter/highlight by group, color, connection type
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Modal.tsx
│       ├── Badge.tsx
│       ├── ColorPicker.tsx
│       ├── SuggestionToast.tsx     # Non-blocking AI suggestion card (accept/dismiss)
│       └── DiffPreview.tsx         # Shows AI re-evaluation changes before committing
├── stores/
│   ├── graphStore.ts           # Zustand: nodes, edges, groups, selection state
│   ├── settingsStore.ts        # Zustand: color meanings, connection type definitions, UI prefs
│   └── uiStore.ts              # Zustand: panel visibility, active modals, command bar state
├── lib/
│   ├── db.ts                   # Dexie.js database schema and instance
│   ├── ai.ts                   # Client-side helpers to call /api/ai/* routes
│   ├── ai-context.ts           # Builds the AIContext object from current state + event log
│   ├── event-log.ts            # Append-only event logger, log every mutation
│   ├── graph-utils.ts          # Bridge score calc, cluster detection, layout helpers
│   ├── import-export.ts        # JSON export/import of full graph + event log
│   └── constants.ts            # Default groups, colors, connection types
├── types/
│   └── index.ts                # All TypeScript interfaces
└── hooks/
    ├── useGraphData.ts         # Load/save graph from IndexedDB, sync with Zustand
    ├── useKeyboardShortcuts.ts # Global keyboard shortcuts
    ├── useConnectMode.ts       # Shift+drag snap-connect interaction state machine
    ├── useEventLog.ts          # Read/query event log, build summaries
    └── useAI.ts                # AI interaction hook with loading states, context building
```

## Data Models

```typescript
// types/index.ts

interface Person {
  id: string;                    // nanoid
  name: string;
  nickname?: string;
  notes?: string;                // freeform notes
  groups: string[];              // group IDs this person belongs to
  colors: string[];              // color tag IDs (multi-color = split node)
  lastSeen?: Date;               // last interaction timestamp
  addedAt: Date;
  meta?: Record<string, string>; // flexible key-value (school, city, etc.)
  pinned?: boolean;              // pin position on graph
  x?: number;                    // pinned x coordinate
  y?: number;                    // pinned y coordinate
}

interface Connection {
  id: string;
  source: string;                // person ID
  target: string;                // person ID
  type: string;                  // connection type ID
  strength: number;              // 1-10, drives edge thickness + brightness + glow (default: 5)
  notes?: string;
  addedAt: Date;
}

interface Group {
  id: string;
  name: string;                  // e.g., "Plano East", "Houston", "UT Hackathons"
  color: string;                 // hex color for cluster background/halo
  description?: string;
  sortOrder: number;
}

interface ColorTag {
  id: string;
  name: string;                  // e.g., "High Signal", "Bridge Connector", "Close Friend"
  color: string;                 // hex
  description?: string;
}

interface ConnectionType {
  id: string;
  name: string;                  // e.g., "Close Friends", "Acquaintance", "Met Once", "Professional"
  color: string;                 // edge color
  dashPattern?: number[];        // e.g., [5, 5] for dashed
  shortcutKey?: string;          // keyboard shortcut when drawing connections
  description?: string;
}

// Every action in the app is logged here. This is the AI's long-term memory.
// The full event log is included (summarized) in every AI API call so it has
// complete context of how the graph evolved over time.
interface EventLogEntry {
  id: string;
  timestamp: Date;
  type: 'ADD_PERSON' | 'REMOVE_PERSON' | 'UPDATE_PERSON'
      | 'ADD_CONNECTION' | 'REMOVE_CONNECTION' | 'UPDATE_CONNECTION'
      | 'MOVE_NODE' | 'CREATE_GROUP' | 'MERGE_GROUP'
      | 'AI_REEVAL' | 'AI_SUGGESTION_ACCEPTED' | 'AI_SUGGESTION_REJECTED'
      | 'MANUAL_OVERRIDE' | 'IMPORT' | 'EXPORT';
  detail: Record<string, any>;  // structured payload specific to the event type
  aiTriggered: boolean;         // was this action initiated or suggested by AI?
  snapshot?: string;            // optional: serialized mini-snapshot of affected nodes for undo
}

// Compact summary the AI receives on every call so it knows the full history
interface AIContext {
  graphSummary: {
    totalPeople: number;
    totalConnections: number;
    groups: { name: string; memberCount: number }[];
    recentEvents: EventLogEntry[];   // last ~50 events in full
    olderEventsSummary: string;      // AI-generated summary of older events (compressed)
  };
  currentPeople: Person[];           // full person list with all metadata
  currentConnections: Connection[];  // full connection list
  currentGroups: Group[];
  colorTags: ColorTag[];
  connectionTypes: ConnectionType[];
}
```

## Default Presets (in constants.ts)

### Default Groups
- Plano East (hometown core)
- Allen
- Dallas / Frisco
- Houston
- UT Austin (general)
- UT CS
- Hackathons
- Gym / Fitness
- Texas Convergent
- Other

### Default Color Tags
- 🔴 High Signal — people worth investing time in
- 🟡 Bridge Connector — connects multiple clusters
- 🟢 New / Fresh — recently met, unexplored potential
- 🔵 Close Friend — inner circle
- ⚪ Neutral — default
- 🟣 Wildcard — unpredictable, interesting

### Default Connection Types
Connection TYPE describes the nature of the relationship. Connection STRENGTH (1-5) is a
separate axis that controls visual thickness/brightness. A "Professional" connection can be
strength 5 (super bright) if it's a strong professional relationship.
- Solid line, blue tint → Close friends (key: 1)
- Solid line, white → Friends (key: 2)
- Dashed line, gray → Acquaintance (key: 3)
- Dotted line, dim gray → Met once (key: 4)
- Solid line, gold → Professional / networking (key: 5)

### Default Strength Scale
Strength is a 1-10 scale (not 1-5) for more nuance. The visual difference between each level
should be obvious and dramatic. Mapped to keyboard: `1-9, 0` (0 = 10).

| Strength | Key | Label | Line Width | Opacity | Glow | Particle Flow |
|----------|-----|-------|-----------|---------|------|---------------|
| 1 | 1 | Ghost — exists on paper only | 0.5px | 0.08 | none | none |
| 2 | 2 | Peripheral — seen them around | 1px | 0.15 | none | none |
| 3 | 3 | Familiar — would say hi | 1.5px | 0.25 | none | none |
| 4 | 4 | Casual — hang in group settings | 2.5px | 0.35 | faint | none |
| 5 | 5 | Solid — genuine connection | 3.5px | 0.5 | soft | none |
| 6 | 6 | Good — text sometimes, real talk | 5px | 0.6 | medium | slow trickle |
| 7 | 7 | Close — regular contact, trust | 7px | 0.7 | bright | steady flow |
| 8 | 8 | Tight — would call at 2am for help | 9px | 0.8 | strong glow | fast flow |
| 9 | 9 | Core — deep bond, always solid | 12px | 0.9 | intense bloom | bright stream |
| 10 | 0 | Unbreakable — ride or die, family-tier | 16px | 1.0 | radiant halo | blazing current, edge pulses |

The jump between 1-4 is subtle (acquaintance tier). The jump from 4→5 is the first real
visual shift (you actually know this person). 6→7 is the next big jump (close friend territory).
8+ should be visually unmistakable from across the entire graph — those edges should glow like
light bridges between stars.

At strength 10 the edge itself has a faint animated aurora effect — color-shifting glow that
slowly cycles between the connection type color and white. These are rare and should feel sacred., inner circle level

## Key Features & Behavior

### 1. Graph Canvas
- Force-directed layout with d3-force via react-force-graph-2d
- Custom Canvas node rendering (NOT default circles):
  - Nodes are circles with the person's initials or first name
  - Multi-color nodes: if a person has 2+ color tags, the circle is split into pie segments
  - Node size scales with connection count (more connected = bigger)
  - Nodes fade/shrink based on `lastSeen` staleness (configurable)
  - Groups cluster together via custom force (forceCluster)
  - The center node (Rehan / "Me") is always larger, distinct styling, fixed at center
- Custom edge rendering:
  - Edge style determined by ConnectionType (solid/dashed/dotted, color)
  - **Edge strength is the primary visual signal (1-10 scale):**
    - Strength 1-3 (acquaintance tier): threadlike, ghostly, barely there
    - Strength 4-5 (solid tier): visible, real, soft glow starts at 5
    - Strength 6-7 (close tier): thick, bright, particle flow begins at 6
    - Strength 8-10 (inner circle tier): blazing light bridges, unmistakable from anywhere on the graph
    - Strength 10 has an animated aurora/color-shift effect — reserved for ride-or-die connections
  - This means two people in completely different groups/clusters can have a blazing bright
    thick line between them that visually screams "these two are tight" even across the graph
  - Animated particle flow on hover to show connection direction
  - Edge labels on hover showing connection type + strength
- Smooth zoom, pan, click-to-select, drag-to-reposition
- Background: dark theme with subtle grid or constellation effect

#### Node Physics & Interaction Feel
- **Drag & wiggle:** Nodes are physically draggable. While dragging, the node follows the cursor
  and connected nodes pull/react via the force simulation (feels alive). On release, the node
  springs back to its force-determined position with a smooth elastic ease (d3 alphaTarget bump).
  The whole graph subtly ripples when you drag — other nodes shift and settle.
- **Pin override:** If the user explicitly pins a node (right-click > Pin), it stays where placed
  and does NOT spring back. Pinned nodes get a small pin icon overlay.
- **Hover juice:** On hover, node gently scales up ~15%, gains a brighter glow ring, and connected
  edges highlight. Neighboring nodes also subtly brighten.

#### Manual Connection via Drag (Snap-Connect)
- **Initiate:** Hold `Shift` and start dragging FROM a node. This enters "connect mode."
  A ghost edge (dashed, semi-transparent) follows the cursor from the source node.
- **Snap-on:** When the cursor passes within the snap radius (~30px) of another node, the ghost
  edge snaps to that node — the target node pulses/highlights to confirm the snap target.
  Visual feedback: target node grows, glows brighter, ghost edge becomes solid.
- **Release:** Releasing while snapped opens a quick radial menu at the midpoint with TWO rings:
  - **Inner ring:** Connection type (click to select)
  - **Outer ring:** Strength slider (1-10), visualized as an arc that gets thicker/brighter
  - Or skip the menu with keyboard held during drag:
    - Hold `F/D/A/S/G` for connection TYPE while dragging (F=Close friends, D=Friends, A=Acquaintance, S=Met once, G=Professional)
    - Hold `1-9, 0` for connection STRENGTH while dragging (0 = 10)
    - If both a letter and number are held, the connection creates instantly on release — zero menu
    - If only one is held, a simplified picker appears for just the missing value
    - Default if neither held: type=Friends, strength=5
- **Cancel:** Releasing in empty space cancels. Pressing Escape cancels mid-drag.
- **AI reaction:** After a manual connection is created, the app fires a background call to
  `/api/ai/react-to-change` with the full AIContext. The AI evaluates whether:
  - The connected people should now share a group
  - A new sub-group or inner circle should be formed
  - Other existing connections or groupings need updating
  - Any suggestions are shown as a non-intrusive toast/suggestion card the user can accept or dismiss.
  All accepted/rejected suggestions are logged to the event log so AI learns preferences over time.

#### Deleting Nodes & Connections
- **Delete a connection:**
  - Click an edge to select it (edge highlights, shows a small "x" button at midpoint)
  - Press `Delete` or `Backspace` to remove. Or click the "x" button.
  - Right-click an edge → context menu → "Delete connection"
  - Confirmation only if the connection has strength >= 4 (strong connections get a "are you sure?")
- **Delete a node (person):**
  - Click a node to select it, then press `Delete` or `Backspace`
  - Right-click → context menu → "Remove person"
  - ALWAYS confirms with a modal: "Remove [Name]? This will also delete their X connections."
  - The modal shows which connections will be lost
  - On confirm: node and all its connections are removed, event logged, AI is notified
- **Bulk delete:** Shift+click to multi-select nodes/edges, then `Delete` removes all selected
  (with a single confirmation modal listing everything being removed)
- **Undo:** Ctrl+Z undoes the last destructive action (delete, disconnect). Uses the event log
  snapshots to restore. Only 1 level of undo for now (can expand later).

### 2. Command Bar (Primary Input — Cmd+K)
- Large, centered overlay input bar (like Spotlight/Raycast)
- Natural language input → hits `/api/ai/parse-input`
- Examples:
  - "Add Jake from Allen, he knows Sarah and plays basketball at UT"
  - "Connect Mike and Jessica, they're close friends from Houston"
  - "Mark David as high signal"
  - "Who bridges my Plano and Houston groups?"
  - "How do I reach David?" (triggers pathfinder — known target)
  - "I want to meet someone in Austin VC" (triggers pathfinder — unknown target)
  - "Find me a path to anyone at Google"
- AI parses intent and returns structured actions (add node, add edge, update node, query)
- Show preview of what AI will do before committing
- Also supports manual mode: type a name to quick-search existing nodes

### 3. Quick Interaction
- **Click node** → Open PersonPanel sidebar with details + "Add Info" section
- **Right-click node** → Context menu (edit, delete, change color, connect to..., pin/unpin)
- **Shift+drag from node** → Snap-connect mode (see Graph Canvas section above)
- **Double-click empty space** → Quick add person (opens mini form)
- **Hold Shift + click multiple nodes** → Multi-select for batch operations
- **Scroll** → Zoom in/out
- **Right-click edge** → Edit/delete connection
- **Regular drag on node** → Wiggle/move (springs back on release)

### 3b. PersonPanel — Detail View & AI Re-evaluation
When clicking a node, the PersonPanel slides in from the right:
- **Header:** Name, color tags (editable), group badges
- **Stats section:** Connection count, groups, bridge score, last seen, date added
- **Notes section:** Freeform editable text area with existing notes
- **"Add More Info" section (KEY FEATURE):**
  - A text input where the user can type additional context about this person
  - Examples: "actually he also knows people from Frisco", "she's in the same CS 314 section"
  - On submit, the app calls `/api/ai/reeval` with:
    - The person's full current data
    - The new info text
    - The full AIContext (all people, connections, groups, event log)
  - AI returns a re-evaluation result:
    - Updated group assignments (e.g., add to "Frisco" group)
    - Suggested new connections (e.g., "should probably be connected to X who is also CS 314")
    - Suggested group creation if new context reveals a cluster
    - Position/cluster changes
  - Results shown as a preview diff: "AI wants to: move Jake to Frisco group, connect to Sarah, create 'CS 314' group"
  - User can accept all, accept some, or reject. All decisions logged to event log.
- **Connection list:** All connections from this person, clickable to navigate to the connected person
- **History:** Recent event log entries involving this person

### 4. Legend Panel (Bottom Right)
- Always visible, collapsible
- Shows all connection types with visual style + keyboard shortcut (F/D/A/S/G)
- Shows the strength scale (1-10) with a visual gradient strip showing thickness/brightness
  at each level — from ghostly thread at 1 to blazing aurora at 10
- Shows all color tag meanings
- Each item is editable inline (click to rename, recolor)
- Keyboard shortcut hints next to everything

### 5. Filter Bar (Top)
- Toggle groups on/off to focus on specific clusters
- Filter by color tag
- Filter by connection type
- Search by name
- "Stale" filter — show only people not seen in X days

### 6. AI Features (via API Routes)
- All AI calls go through Next.js API routes to keep the Anthropic key server-side
- Model: `claude-sonnet-4-20250514` for speed on parsing tasks
- **CRITICAL: Every AI call receives the full AIContext object** (built by `ai-context.ts`).
  This includes all people, connections, groups, the recent event log (last ~50 entries in full),
  and a compressed summary of older events. The AI always has full context of the graph's history.
- System prompt should establish:
  - This is a personal social graph tool
  - Output must be structured JSON matching our data models
  - Be concise, no fluff
  - When categorizing, use the user's existing groups first, suggest new ones only if nothing fits
  - Reference the event log to understand how the graph has evolved and what the user prefers
  - If the user has rejected similar suggestions before (visible in event log), don't repeat them

#### API Routes:
- `/api/ai/parse-input` — Parse natural language commands into structured CRUD operations
- `/api/ai/categorize` — Given a person description, assign groups and suggest color tags
- `/api/ai/reeval` — **Re-evaluation endpoint.** When the user adds new info to an existing person,
  this endpoint receives the person's data + new info + full AIContext and returns:
  - Updated group assignments
  - Suggested new/removed connections
  - Suggested new group creation
  - Reasoning for each change
  - Confidence score per suggestion
- `/api/ai/react-to-change` — **Reactive AI endpoint.** Fires automatically after manual actions
  (manual connections, manual group changes, manual moves). Receives the action that just happened
  + full AIContext and returns suggestions:
  - "You just connected A and B. Based on their groups, you might also want to connect A to C."
  - "A and B being connected means the 'Plano East' and 'Allen' groups overlap. Create a combined sub-group?"
  - "This connection makes D a bridge between 3 clusters. Mark as Bridge Connector?"
  - Suggestions are NON-BLOCKING — shown as a toast/suggestion card in bottom-left. User can
    accept (one click) or dismiss. Both actions are logged.
- `/api/ai/suggest` — On-demand analysis. Analyze graph data and surface insights:
  - Bridge connectors (nodes connecting isolated clusters)
  - Dead zones (clusters with no cross-connections)
  - Suggested introductions
  - "You keep seeing X because they're connected to Y, Z, W in 3 different groups"
  - Social expansion recommendations based on graph structure
- `/api/ai/pathfinder` — **Six Degrees Pathfinder (KEY FEATURE).** Given a target person
  (who may or may not exist in the graph), find the shortest social path to reach them.
  Two modes:
  - **Known target:** Target exists in graph. Run BFS/Dijkstra on the graph first (in
    `graph-utils.ts`) to find the literal shortest path, then send to AI for strategic advice
    on which path is most actionable (shortest isn't always best — a 3-hop path through close
    friends beats a 2-hop path through an acquaintance you met once).
  - **Unknown target:** Target is NOT in the graph (e.g., "I want to meet the founder of X" or
    "I want to connect with someone in the Austin VC scene"). AI analyzes the full graph context
    and returns:
    - Which existing nodes are most likely to be close to the target (by group, industry, city, etc.)
    - A ranked list of "approach chains" — sequences of introductions to pursue
    - What gaps exist in the graph and what types of people to seek out to close the distance
    - Concrete next steps: "Talk to Sarah (Houston / tech), she likely knows people in Austin VC.
      If not, ask her to intro you to her coworker who went to McCombs."

#### AI Context Pipeline (ai-context.ts):
1. On every AI call, `buildAIContext()` is called
2. It reads all current data from Zustand stores
3. It reads the event log from IndexedDB
4. Recent events (last 50) are included in full
5. Older events are summarized — if no summary exists yet, one is generated via a lightweight
   AI call and cached. The summary is regenerated when the older-events count grows by 50+.
6. The full AIContext is serialized and sent as part of the system prompt to every AI route
7. Token budget: keep the full context under ~20k tokens. If the graph grows very large,
   compress person data to essential fields only (name, groups, connection count)

### 7. Persistence (Dexie.js / IndexedDB)
- All data stored locally in the browser
- Tables: `people`, `connections`, `groups`, `colorTags`, `connectionTypes`, `eventLog`, `settings`, `aiSummaryCache`
- Auto-save on every mutation (debounced 500ms)
- The `eventLog` table is append-only. Every single mutation in the app is logged here:
  - Adding/removing/editing people or connections
  - AI suggestions accepted or rejected
  - Manual overrides (user moved a node the AI placed, user rejected a group assignment)
  - Group creation/deletion/merges
- Event log is never deleted (it IS the AI's memory). It can be exported separately.

### 7b. Export/Import (Full Data Portability)
- **JSON Export (Cmd+E):** Downloads a single `.json` file containing:
  - All people with full metadata
  - All connections
  - All groups, color tags, connection types
  - Full event log
  - Settings
  - Export timestamp and version number
  - This file is both human-readable and machine-parseable
- **JSON Import:** Upload a previously exported file to restore the full graph state
  - Shows a preview/diff before committing if there's existing data
  - Option to merge with existing data or replace entirely
- **CSV Export:** Simplified export — just people + connections as flat tables for spreadsheet use
- The exported JSON is designed to be loadable by any other tool — it's a complete, self-contained
  snapshot of the entire social graph with full history

### 8. Settings Panel
- Manage groups (add, rename, reorder, delete, recolor)
- Manage color tag meanings
- Manage connection types (name, style, shortcut key)
- Graph physics settings (charge strength, link distance, cluster force)
- Theme toggle (dark/light — dark is default and primary)
- "Last seen" staleness threshold

### 9. Six Degrees Pathfinder (KEY FEATURE)
The pathfinder answers: "How do I reach person X from where I am now?"

#### Activation
- Command bar: "How do I reach [name]?" or "Find path to [name]" or "I want to meet [description]"
- Right-click a node → "Find path to me" (for nodes far from center)
- Keyboard shortcut: `Cmd/Ctrl + P` → opens PathfinderPanel directly
- Dedicated button in the top bar (compass/route icon)

#### PathfinderPanel UI
Slides in from the right (replaces PersonPanel if open):
- **Target input:** Text field at the top. Can be:
  - A name of someone already in the graph ("find path to David")
  - A description of someone NOT in the graph ("a VC in Austin", "someone at Google who went to UT")
- **Mode indicator:** "Known person" (in graph) vs "Unknown target" (AI-powered search)

##### Known Target Mode (person exists in graph):
1. `graph-utils.ts` runs BFS to find ALL shortest paths (there may be multiple)
2. AI receives the paths + full context and ranks them by actionability:
   - Prefers paths through close friends over acquaintances
   - Prefers paths through recently-seen people over stale ones
   - Prefers paths through bridge connectors who are used to making intros
3. **Path visualization on the graph canvas:**
   - All non-path nodes dim to ~20% opacity
   - The path nodes and edges glow brightly, highlighted with animated particles flowing
     along the path from "Me" to the target
   - Each hop is numbered (1 → 2 → 3 → ...)
   - If multiple paths exist, show the top 3 as toggleable tabs. Switching tabs animates
     the highlight to the new path.
4. **Strategy card** below the path visualization:
   - Step-by-step intro chain: "1. Ask Sarah (close friend) → 2. She introduces you to Marcus
     (her Allen friend) → 3. Marcus knows David through basketball"
   - AI rates each hop with difficulty (easy/medium/hard) based on connection strength
   - Overall path difficulty score
   - Suggested conversation starters or context for each intro ask

##### Unknown Target Mode (person NOT in graph):
1. User describes who they want to reach (role, company, scene, city, etc.)
2. AI analyzes the full graph and returns:
   - **Closest cluster:** Which part of your graph is closest to the target world
   - **Anchor nodes:** 2-3 people in your graph most likely to bridge the gap, with reasoning
   - **Approach chains:** Ranked strategies, each with concrete steps:
     - "Chain A (best): Sarah → [her coworker at Dell] → [Austin tech meetup scene] → target"
     - "Chain B (backup): Your UT CS network → [professor connections] → target"
   - **Gap analysis:** "You have no one in the Austin VC scene. To close this gap, attend X
     event or ask Y person about their investor connections."
   - **Discovery suggestions:** Types of people to add to your graph that would open new paths
3. **Graph visualization:**
   - Anchor nodes glow/highlight on the canvas
   - A dashed "projected path" extends from anchor nodes outward into empty space with a
     ghost node representing the unknown target
   - The gap between your graph edge and the target is visually represented

#### Pathfinder in graph-utils.ts
```typescript
// BFS shortest path(s) between two nodes
function findShortestPaths(
  people: Person[],
  connections: Connection[],
  sourceId: string,
  targetId: string,
  maxPaths?: number  // default 5
): Path[]

// Each path includes metadata for AI ranking
interface Path {
  nodes: string[];           // ordered person IDs from source to target
  hops: number;
  connections: Connection[];  // the actual edges traversed
  avgStrength: number;       // average connection strength along the path
  weakestLink: { connection: Connection; strength: number };
  stalestNode: { personId: string; lastSeen: Date | null };
}

// Find nodes closest to a described target (for unknown target mode)
// Returns nodes sorted by relevance based on group/meta overlap with description
function findAnchorNodes(
  people: Person[],
  connections: Connection[],
  groups: Group[],
  targetDescription: string  // passed to AI for semantic matching
): Person[]
```

#### Pathfinder AI System Prompt (appended for /api/ai/pathfinder)
```
The user wants to reach a target person through their social graph. You apply the six degrees
of separation principle: any person can be reached through a chain of introductions.

You receive:
- The target (a name in the graph, or a description of someone outside it)
- The full graph context (all people, connections, groups, event log)
- For known targets: pre-computed shortest paths with metadata (strength, staleness)

KNOWN TARGET — Return: {
  rankedPaths: [{
    pathNodeIds: string[],
    rank: number,
    reasoning: string,           // why this path is better/worse than alternatives
    hopStrategies: [{
      fromPersonId: string,
      toPersonId: string,
      difficulty: 'easy' | 'medium' | 'hard',
      suggestedApproach: string, // "Ask Sarah casually at gym, she sees Marcus weekly"
      context: string            // relevant shared context between the two people
    }],
    overallDifficulty: number    // 1-10
  }]
}

UNKNOWN TARGET — Return: {
  feasibility: 'likely' | 'possible' | 'long_shot',
  anchorNodes: [{
    personId: string,
    relevance: string,           // why this person is a good starting point
    estimatedHopsToTarget: number
  }],
  approachChains: [{
    rank: number,
    description: string,         // narrative description of the chain
    steps: [{ action: string, person?: string, reasoning: string }],
    difficulty: number           // 1-10
  }],
  gapAnalysis: {
    missingConnectionTypes: string[],  // "no one in Austin VC", "no McCombs alumni"
    suggestions: string[]              // concrete actions to close gaps
  }
}

Rules:
- Be realistic. Don't claim a path is easy if it goes through someone marked "met once."
- Factor in lastSeen — a connection from 6 months ago is weaker than one from last week.
- For unknown targets, don't hallucinate specific people outside the graph. Describe roles/types.
- Max 3 approach chains for unknown targets.
- Every suggestion must be actionable — not "network more" but "ask Sarah about her Dell coworkers."
```

## Visual Design Direction
**Theme: Deep Space Observatory** — You're looking at your social universe through a cosmic lens.
The app should feel like peering into a living star map at a high-end planetarium.

### Background & Atmosphere
- **Base:** True black (#050510) with a subtle radial gradient toward deep indigo (#0a0a2e) at edges
- **Star field:** Multiple parallax layers of stars (tiny dots) at different depths that shift
  subtly on mouse move (parallax effect). 3 layers:
  - Far layer: hundreds of 0.5-1px dots, barely visible, very slow parallax
  - Mid layer: dozens of 1-2px dots, soft white, moderate parallax
  - Near layer: a few 2-3px dots with subtle twinkle animation (opacity pulse)
- **Nebula clouds:** 2-3 large, extremely subtle gradient blobs (purple, teal, deep rose) that
  drift very slowly across the background. Use radial gradients with blur filters, ~5% opacity.
  These should be almost subliminal — you notice the color shift but can't pinpoint the shape.
- **Shooting stars:** Random shooting star animations. Thin bright line that streaks across a
  portion of the canvas and fades. Frequency: one every 15-30 seconds. Randomize angle, position,
  length, speed. Trail should have a fading tail. Keep them subtle — they're a delight when
  noticed, not a distraction.
- **Astral geometry:** Subtle sacred geometry / constellation patterns rendered in the deep
  background at ~3-5% opacity. Think: faint hexagonal grids, fibonacci spirals, or Metatron's
  cube fragments that slowly rotate. These should be barely perceptible — visual texture, not
  decoration. Rendered as SVG or Canvas behind everything.
- **Cosmic dust:** Very faint particle field (like dust motes in a sunbeam) that drifts slowly.
  Tiny dots (~0.5px) with very low opacity (~0.1) moving in gentle Brownian motion.

### Nodes (People)
- **Glow:** Each node has a soft radial glow/bloom behind it matching its primary color tag.
  The glow radius scales with connection count — highly connected people radiate more light.
- **Surface:** Nodes have a subtle glass/crystal surface effect — faint inner gradient from
  lighter at top to darker at bottom, mimicking a sphere catching light.
- **Breathing:** Nodes have a very slow, gentle pulse animation (scale 1.0 → 1.02 → 1.0 over
  ~4 seconds, staggered per node). The graph should feel alive, not static.
- **Multi-color:** Pie-segment split with soft blended edges between colors, not hard cuts.
- **The "Me" node:** Larger, brighter, with a distinct ring system (like Saturn) — a faint
  orbital ring that slowly rotates. Gold/white color scheme to stand out from everything else.
- **Text:** Name labels in a clean mono font (JetBrains Mono), rendered with a very faint text
  shadow/glow matching the node color. White text, ~80% opacity.

### Edges (Connections)
- Edges should look like energy streams or light bridges between stars.
- Strong connections (4-5) have a visible energy flow: tiny particles traveling along the edge
  at all times (not just on hover). Slow, ambient, like a current.
- Weaker connections are more ghostly — low opacity, no particle flow, just a faint line.
- On hover: the edge brightens and particles accelerate.

### Cluster Halos
- Groups of nodes have a soft, diffuse colored halo behind them — like a nebula surrounding a
  star cluster. Use a voronoi-based or convex-hull shape with heavy Gaussian blur and ~10-15%
  opacity. The halo color matches the group color.
- Halos should softly morph/breathe as nodes shift positions.

### UI Chrome (Panels, Modals, Bars)
- **Glassmorphism v2:** Panels use `backdrop-filter: blur(20px)` with a semi-transparent
  background of rgba(10, 10, 30, 0.7). Subtle 1px border of rgba(255, 255, 255, 0.08).
- **Inner glow:** Panels have a faint inner top-edge highlight (1px gradient from white 5% to
  transparent) to simulate glass catching light.
- **Rounded corners:** 16px radius on all panels.
- **Shadows:** Large, soft, colored shadows (e.g., `0 8px 32px rgba(59, 130, 246, 0.1)`).
- **Entry animations:** Panels slide + fade in with spring physics (Framer Motion, stiffness ~300, damping ~30).
- **Text:** Primary text in white/90% opacity. Secondary text in white/50%. Never pure gray.

### Color Palette
- **Background:** #050510 → #0a0a2e gradient
- **Primary accent:** Electric blue #3b82f6 (buttons, active states, the "Me" node ring)
- **Secondary accent:** Violet #8b5cf6 (secondary actions, some group halos)
- **Success/confirm:** Emerald #10b981
- **Warning:** Amber #f59e0b
- **Danger/delete:** Rose #f43f5e
- **Node defaults:** Soft pastels that glow well on dark — cyan, pink, gold, lime, lavender
- **Text:** #ffffff at varying opacities (90%, 60%, 40%)

### Typography
- **Display / headings:** Space Grotesk or Outfit (geometric, modern, slightly futuristic)
- **Data / labels / mono:** JetBrains Mono (node names, stats, code-like elements)
- **Body:** The display font at regular weight works for body too — keep it consistent

### Micro-interactions & Polish
- **Command bar:** Opens with a burst of light — a quick flash/ring that expands and fades,
  like opening a portal.
- **Node creation:** New nodes appear with a "materialization" effect — start as a bright point
  of light that expands into the full node with a brief flash.
- **Node deletion:** Inverse — node collapses into a bright point and winks out, connected edges
  retract and fade simultaneously.
- **Connection creation:** Edge draws itself from source to target with a bright leading particle,
  like a spark traveling along a wire.
- **Pathfinder activation:** The path lights up sequentially — hop by hop, each node flashing
  as the "signal" reaches it, like a chain of beacons firing across the galaxy.
- **Toast notifications:** Slide in from bottom-left with a subtle glass chime sound effect
  (optional, toggle in settings). Fade out after 5 seconds or on dismiss.

### Performance Notes for Visual Effects
- Star field: Use a single Canvas layer behind the graph. Pre-render static stars, only animate
  the twinkle/shooting star layers.
- Nebula clouds: CSS only — absolute positioned divs with radial-gradient and blur filter.
  Animate with CSS transforms (translateX/Y), not JS.
- Shooting stars: CSS @keyframes animation on absolute positioned elements. Create/destroy
  DOM elements on a setInterval(random(15000, 30000)).
- Astral geometry: Single SVG element with CSS transform: rotate() animation, extremely slow.
- Node glow: Canvas shadow blur in nodeCanvasObject. Tune shadowBlur for performance.
- Keep all background effects on their own compositor layer (will-change: transform) to avoid
  repainting the graph layer.

## Keyboard Shortcuts
- `Cmd/Ctrl + K` → Open command bar
- `Cmd/Ctrl + N` → Quick add person
- `F/D/A/S/G` (while Shift+dragging connection) → Set connection type
- `1-9, 0` (while Shift+dragging connection) → Set connection strength (0 = 10)
- `Delete/Backspace` → Delete selected node(s)/edge(s)
- `Cmd/Ctrl + Z` → Undo last destructive action
- `Escape` → Close panels, deselect, cancel connect mode
- `Cmd/Ctrl + E` → Export graph JSON
- `Cmd/Ctrl + F` → Focus search/filter
- `Cmd/Ctrl + L` → Toggle legend
- `Cmd/Ctrl + P` → Open pathfinder panel
- `Cmd/Ctrl + S` → Force save (auto-save is default)
- `Shift + click` → Multi-select nodes/edges
- `Shift + drag from node` → Enter snap-connect mode

## Development Notes
- Use `nanoid` for all IDs
- Use `date-fns` for date formatting/relative time
- Canvas rendering in react-force-graph-2d via `nodeCanvasObject` and `linkCanvasObject` props
- Cluster force: implement custom d3-force that pulls nodes toward their group centroid
- The "Me" node should have `fx: 0, fy: 0` to stay pinned at center
- Handle window resize gracefully
- All panels should be closeable and not obstruct the graph
- Mobile: not a priority, desktop-first. But don't break on mobile.

### Node Physics Implementation
- react-force-graph-2d exposes `d3Force()` to access the underlying simulation
- On drag start: set `node.fx = x, node.fy = y` to pin temporarily, bump `alphaTarget(0.3)` so the sim heats up and other nodes react
- On drag (move): update `node.fx, node.fy` to cursor position — the sim keeps running so connected nodes pull and wiggle
- On drag end (non-pinned node): CLEAR `node.fx, node.fy` (set to undefined) and bump `alphaTarget(0)` — the node springs back to its force-determined position with natural d3 spring physics. The whole graph settles.
- On drag end (pinned node): KEEP `node.fx, node.fy` — it stays where placed
- The spring-back should feel snappy but not instant. Tune via `alphaDecay(0.02)` and `velocityDecay(0.3)`

### Snap-Connect Implementation
- Maintain a `connectMode` state: `{ active: boolean, sourceId: string | null, cursorPos: {x, y}, snapTarget: string | null }`
- On Shift+mousedown on a node: enter connect mode, store source node ID
- On mousemove in connect mode: draw ghost edge from source node to cursor on a Canvas overlay layer. Check distance to all nodes — if within 30px (in graph coordinates, not screen), set snapTarget
- When snapTarget is set: draw ghost edge to the target node center instead of cursor, highlight target node (scale up + glow in nodeCanvasObject)
- On mouseup with snapTarget: create connection, log event, fire AI react-to-change
- On mouseup without snapTarget: cancel
- On Escape: cancel

### Event Logging Discipline
- EVERY state mutation must go through a central `dispatch` function in graphStore that:
  1. Applies the mutation to Zustand state
  2. Persists to IndexedDB
  3. Appends an EventLogEntry to the eventLog table
- Never mutate state directly. Always go through dispatch.
- The event log is the source of truth for AI context. If it's not logged, the AI doesn't know about it.

## AI System Prompts

### Core System Prompt (included in ALL AI calls)
```
You are the AI engine for Social Web, a personal social graph tool owned by Rehan. He is at the center of the graph. Every person, connection, and group in the graph represents his real social network.

You receive the full AIContext on every call, which includes:
- All people, connections, and groups currently in the graph
- The event log showing every action taken (adds, deletes, edits, your past suggestions and whether they were accepted or rejected)
- Use the event log to understand Rehan's preferences. If he rejected a suggestion before, don't repeat it.

Output must be structured JSON matching the data models. Be concise. No fluff.
When categorizing, use existing groups first. Only suggest new groups if nothing fits.
```

### Parse Input System Prompt (appended for /api/ai/parse-input)
```
Parse the user's natural language command into structured JSON actions.

Available actions:
- ADD_PERSON: { name, groups?, colors?, notes?, connections?: [{ targetName, connectionType }] }
- ADD_CONNECTION: { sourceName, targetName, type, notes? }
- UPDATE_PERSON: { name, updates: { groups?, colors?, notes?, lastSeen? } }
- REMOVE_PERSON: { name }
- REMOVE_CONNECTION: { sourceName, targetName }
- QUERY: { question }

Always return: { actions: [...], reasoning: string }
Match names fuzzy (Jake = Jacob if only one Jacob exists in the graph).
If ambiguous, return { clarification: "Did you mean Jake from Allen or Jake from Houston?" }
```

### Re-evaluation System Prompt (appended for /api/ai/reeval)
```
The user has added new information about an existing person. Re-evaluate their placement in the graph.

You receive:
- The person's current full data (groups, connections, notes, colors)
- The new information text the user just provided
- The full graph context (all people, connections, groups)

Return: {
  updatedGroups: string[],          // new group assignment (full list, not delta)
  suggestedConnections: [{ targetId, targetName, connectionType, reason }],
  removedConnections: [{ targetId, reason }],
  suggestedNewGroups: [{ name, reason }],   // only if no existing group fits
  colorTagChanges: [{ colorTagId, action: 'add' | 'remove', reason }],
  reasoning: string                  // explain the overall re-evaluation logic
}

Be conservative. Don't over-connect. A suggested connection should have a real basis in the data, not just "they're in the same group."
```

### React to Change System Prompt (appended for /api/ai/react-to-change)
```
A manual action just occurred in the graph. Evaluate if the graph structure should adapt.

You receive:
- The action that just happened (e.g., manual connection created, node moved, group changed)
- The full graph context including event history

Return: {
  suggestions: [{
    type: 'CREATE_GROUP' | 'MERGE_GROUPS' | 'ADD_CONNECTION' | 'REMOVE_CONNECTION' | 'CHANGE_GROUP' | 'CHANGE_COLOR',
    detail: { ... },    // action-specific payload
    reason: string,      // one-sentence explanation shown to user
    confidence: number   // 0-1, only show suggestions with confidence > 0.6
  }],
  reasoning: string
}

Rules:
- Max 3 suggestions per reaction. Don't overwhelm.
- Check the event log for rejected suggestions. Don't re-suggest rejected patterns.
- Only suggest group creation if 3+ people would belong to it.
- Only suggest group merges if groups have 50%+ overlap in connections.
```

## Error Handling
- If AI parsing fails, fall back to manual entry form pre-filled with what was understood
- If IndexedDB is unavailable, show warning and operate in memory-only mode
- All destructive actions (delete person, clear graph) require confirmation modal

## Performance
- react-force-graph-2d handles 1000+ nodes efficiently with Canvas rendering
- Debounce all IndexedDB writes
- Memoize computed values (bridge scores, cluster assignments)
- Lazy load AI features — don't import Anthropic SDK on initial load
