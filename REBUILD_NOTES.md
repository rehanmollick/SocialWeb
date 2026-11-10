# SocialWeb rebuild — September 2026

## Purpose and user decisions

The user wants to map people worth remembering and maintaining: useful collaborators, high-agency builders, important connections, close friends, and people relevant to content, UGC, startups, freelance work, career, introductions, advice, and social life.

High signal and high agency are explicitly manual judgments. Closeness is separate. A person has one spatial home and any number of overlapping circles. The current target is a laptop; public hosting is a future step.

## Audit findings and changes

| Finding in the original app                                                                  | Current behavior                                                                                          |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Landing and token pages delayed access to the actual tool                                    | Root opens the relationship workspace                                                                     |
| Canvas mixed rendering, simulation, group inference, and persistence in 3,593 lines          | Separate SVG map, pure layout helpers, profile editor, memory composer, and assistant                     |
| Background membership and transient spatial grouping competed; mechanics documents disagreed | Persistent `bg` is the only spatial membership; change it on an explicit drop or profile edit             |
| Capitalized words became people when no API key existed                                      | Offline suggestions match only existing full names                                                        |
| Notes silently increased closeness and co-mentions became relationships                      | Memories link explicit selected people; closeness and relationship edges stay unchanged                   |
| Hardcoded groups limited extraction and editing                                              | User-named groups and independent overlapping circles                                                     |
| AI tools could directly delete and mutate the graph using fuzzy name matches                 | Retired executor; read-only grounded Q&A and reviewable extraction                                        |
| Profile detail was fragmented across graph controls                                          | Compact editor for note, manual judgments, closeness, and circles; group and connection details collapsed |
| Restore cleared the DB before validating the complete payload                                | Versioned import validation plus atomic SQL transaction and recoverable snapshot                          |
| Deleting a person could leave orphan edge overrides                                          | Delete cleans up explicit edges in the same transaction                                                   |
| Missing unified recovery                                                                     | Last 25 mutation snapshots available through Undo                                                         |
| No meaningful automated workflow checks                                                      | Isolated browser/API tests for capture, editing, map membership, persistence, undo, and restore           |

## September 21 design correction

The first rebuild overemphasized dashboard statistics, permanent navigation and assistant panels, and a follow-up workflow the user did not want. Those elements are removed from the default surface. The star map now fills the viewport, with small map controls and sliding docks that resize the canvas. The original space theme is expressed through a dark star field, orbital lines, group haze, and luminous markers.

- **Demo universe:** 25 fictional people in five groups, separate localStorage, editable with in-session undo/reset. No personal database writes or paid Claude calls.
- **Add people:** names only, paste up to 100 lines, optional `Name | note`, or double-click a map location. Batch writes are atomic and one undo reverses them.
- **Person:** name, note, ten manual judgment traits, qualitative closeness, and grouped circle chips. Edits autosave with debouncing, serialized writes, close/switch flushing, error state, and retry. Connections/group selection and memories are collapsed. No follow-up fields.
- **Explore:** search and optional filtering by circles, manual labels, and spatial homes; People and Memories views remain available.
- **Ask:** on-demand read-only Claude panel grounded in personal context. Demo mode explains how to switch to personal context.
- **Settings:** group management, Claude status, personal backup/export/restore, and demo reset.

Circle suggestions use simple topic matching against the note and require explicit acceptance. Only accepted circles create map topic markers. Closeness has a visible 1–5 badge and star-size cue; the gold agency bolt is substantially larger. All circles and judgments remain inspectable in the node tooltip and accessible name.

## September 30 creative review

GPT-6 Astra reviewed the direction and screenshots; GPT-6.1 Sol implemented the focused changes. The review prioritized finding people, readable labels, simpler profiles, and keeping unfinished work over adding more navigation or decorative effects.

- Explore shows selectable matches with profile context above its filters. Enter opens the first result. Memory search includes linked names and applies attribute filters independently from words in the memory body.
- Profiles show selected and suggested circles first, with the complete catalog collapsed. People cards use the same qualitative closeness and five-level scale as the map.
- Map names use 11–12px preferred screen-space type with a 10.5px fallback and at least 12px for hover/selection. Label packing reserves group-heading space. Selecting a person pans only as needed to reveal them; manual zoom still wins over automatic fitting. The SVG exposes its interactive people as a group rather than a single image.
- Capture validates missing/duplicate names and oversized batches before writes. Memory selections remain visible while searching. Add drafts retain names, group, and placement; memory drafts retain text and linked people, separated by universe and memory ID. They survive panel changes, clear on save/discard, and are lost on page refresh.
- Ask retains conversation and unsent input while inspecting a referenced person. Its hidden panel is removed from keyboard/accessibility navigation, and switching universes resets it. Offline Enter cannot invoke the provider.
- Narrow-screen controls use two header rows and wider editing docks. Screenshot checks wait for dock geometry to settle rather than capturing in the middle of a transition.

Validation before the session pause: all 11 original tests passed; the first expanded browser run passed 14 of 16. The two failures were a drag assertion using a pre-simulation coordinate and a dense-map name-count threshold tied to the former tiny labels. Checks now compare actual saved spacing, readable screen-space type, label/heading collisions, and selection visibility. Those adjusted browser checks and the later draft/mobile/Ask workflows still require a full rerun.

After resume, the managed environment denied localhost listening with `EPERM` on port 3101, preventing browser tests and final screenshots. TypeScript checking and the production build passed, as did the standalone map-packing test (1/1). Playwright discovers 22 tests across three files; discovery is not a passing browser run. The Ask tests use a stubbed response to verify UI continuity; they do not certify real Claude output. Existing mobile screenshots predate the final mobile changes and are not evidence of the final layout.

## Current physics

Groups use seeded grids, staggered rows, hexagonal arrangements, or orbits with varied rotation. Name widths and trait counts determine spacing. Saved coordinates establish group centers and initial positions, then D3 gently attracts orbs toward geometric slots with collision avoidance and damping. Automatic settling is read-only and cools to a stop; reduced-motion preference settles synchronously. Profile note edits do not restart it.

Group boundaries derive from their live members' centroid and furthest distance plus padding. Drop tests use boundaries captured before the drag, excluding the dragged person, so dragging cannot make its own target boundary expand indefinitely. When boundaries overlap, the nearest normalized center wins. A drop outside all groups and outside the original boundary creates a new unnamed spatial home. A drop onto another person is nudged into free space; it keeps the chosen membership. Group drags retain memberships, preserve internal geometry, and nudge a crowded constellation as a unit. Drag start stops the cooling simulation to prevent stale simulation coordinates snapping a node back. Any completed drag saves the entire displayed arrangement and the changed membership in one transaction, including previously unpositioned people. These coordinates remain anchors on reload; automatic geometric settling can adjust the visible arrangement afterward. Pointer cancellation restores the pre-drag positions without a write.

Circles do not participate in forces. Filtering dims nonmatches without changing membership or positions. Physical distance is an arrangement; size and a 1–5 badge represent closeness, a bright aura represents high signal, and explicit edge weight represents connection strength. Every selected judgment appears around its orb, with a larger gold high-agency bolt. Zero closeness allows people you do not personally know. Legacy direct lines to the origin remain supported in stored data. Measured name labels shrink gradually with zoom and try alternate positions and smaller type before omission; selection and hover force the name visible. The People view always lists every match.

Rendering uses SVG, with 620 background stars, nebula gradients, planets, planetary rings, a comet, orbital lines, and group haze. The background is memoized and has no animation loop. Every selected circle has a ring segment, while the star core consistently keeps its spatial-group color. The docked map key explains all symbols and lists current colors. It avoids the old perpetual decoration loop. Group haze follows membership and geometry. It is not an AI or proximity-based inference of real relationships.

## Data and AI

Personal writes use SQLite on the server; the isolated demo uses browser localStorage. The additive fields include `circles` and legacy contact/follow-up columns. Legacy follow-up fields stay preserved but are no longer shown or supplied to Claude. Snapshot history contains the six application tables. Restores and undo are transactional. Creating a person plus a new named home is one recoverable mutation.

Claude receives profiles, manual labels, circles, explicit relationships, the selected person, recent conversation, and up to 50 memories ranked by query terms and selected-person relevance. The prompt requires evidence, dates, and acknowledgment of gaps. A size limit prevents oversized context requests. Model output is still model output: source grounding is prompted, not formally proven.

Extraction only suggests names. Users review selections and explicitly create unfamiliar people. It never assigns high signal, high agency, closeness, or groups. Without a key, memory capture and editing still work; Q&A is visibly unavailable.

## Validation and limits

The browser suite uses a separate disposable `/tmp/socialweb-e2e.db`. It covers demo isolation, viewport usage, quick/bulk add, manual judgments and circle suggestions, memory capture, persistence, atomic batch rollback/undo, individual and whole-group dragging, canceled drag, double-click creation, invalid writes, failed restore atomicity, a 100-person scenario, dock/map non-overlap, circle-ring coverage, zoom controls, rapid autosaves across people, and failed-save recovery. Screenshots under `artifacts/` use synthetic people.

Production build and TypeScript checking are required before delivery. Live paid Claude calls have not been exercised with a real key in this session. Tests cover offline behavior; actual provider availability and model output cannot be certified by these tests.

This version has no sign-in, multi-device synchronization, or remote durable database. It is intended for a local single user. SVG and whole-database undo snapshots should be profiled before using thousands of people or very large journals. Phone ergonomics are secondary to the laptop target. Chat history is in memory rather than persisted between page reloads. Version 1 JSON backups need conversion; the original SQLite backup remains available.

## November 2026 revamp

Usage data drove this: 28 real people, zero notes, 23 with no labels. The map
was not the problem; writing anything down took too many decisions.

- The rebuild was promoted from a nested clone to the repo root and now runs on
  the original database. Runtime migrations take the write lock, because several
  build workers loading the module at once raced on `ALTER TABLE`.
- Profiles open on bullet notes and a next step. Judgment labels and closeness
  are behind a fold. Editing notes stamps `last_contact`, shown as "last
  touched", so nobody fills in a date.
- Next steps came back in a lighter form than the follow-up workflow removed in
  September: one line per person, a Done button, no due dates.
- Claude proposes; the user disposes. `/api/suggest` reads a saved profile and
  returns circles and a next step as tap-to-accept chips. `/api/capture` sorts a
  free-form brain dump into per-person bullets for review, then applies the
  reviewed rows in one transaction (one Undo). This relaxes the September rule
  that Claude only extracts names; it still never assigns judgment labels or
  closeness, and never writes without a tap.
- Radar is plain rules over saved fields (`lib/graph/nudges.ts`), not a model
  call, so it is instant and free.
- The Doing view feeds the same map component a derived graph with one virtual
  node per person per circle. Dragging edits circle membership and never saves
  positions.
- Physics: a person with saved coordinates is anchored to them; formations only
  seat people without a position. "You" is a fixed collision body at the origin.
- Models: Ask uses `claude-opus-5-5`, filing uses `claude-haiku-5-5`, both
  overridable by environment variable.
- Phone access is the laptop serving the app behind a passcode (`proxy.ts`,
  `bun run phone`). A hosted version would need the synchronous SQLite layer
  replaced and was left for later.
