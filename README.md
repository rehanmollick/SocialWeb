# SocialWeb

A private, local relationship workspace: remember who you know, mark the people who matter to you, find relevant collaborators, and explore your personal universe.

## Start locally

```bash
bun install
cp .env.example .env.local
# Optional: set ANTHROPIC_API_KEY in .env.local.
bun run dev
```

Open **http://127.0.0.1:3000**. Manual profiles, the map, memories, filters, export, and undo work without Claude. With a key, Claude can suggest names for review and answer questions from saved context. `ANTHROPIC_MODEL` overrides the default Haiku model. Keys remain on the server.

```bash
bun run typecheck
bun run test
bun run build
bun run start
```

Browser tests use Chrome and a separate disposable database at `/tmp/socialweb-e2e.db`, on port 3101. The test suite replaces that database; never point it at your personal database. Development and production servers bind to localhost. The webpack scripts avoid the Turbopack CSS worker problem observed in this environment.

## Everyday flow

1. Start with the preloaded **Demo universe**: 25 fictional people across five spatial groups, overlapping circles, manual labels, explicit connections, and a sample memory. It is editable and saved only in this browser. Use **My people** in the header to switch to your real database; your choice is remembered.
2. **Add people** accepts one name or a pasted list, one name per line. `Name | a short note` adds optional context. Up to 100 people can be added in one atomic, undoable batch. Missing names, duplicates, and oversized batches are explained before submission. Double-click map space to add someone at that location; inside a group, they join it.
3. Select a star to edit its note, closeness, and **Your judgment** traits (high signal, high agency, important, close friend, great company, helpful, interesting, reliable, inspiring, opens doors). Changes autosave after a 350 ms pause; pending writes are serialized and a failed save offers Retry. Selected circles and suggestions appear first; **Browse all circles** opens the catalog. You can also add a custom circle. Description-based suggestions require a tap; judgments are never inferred.
4. Drag a person into a group's boundary to join it; drag a group's boundary or label to move the whole constellation. Circles stay intact. Moves save the displayed coordinates as anchors; orbs then gently settle into seeded geometric formations with room for names. Automatic settling never writes to your database or changes membership.
5. **+ Memory** captures useful context, with linked people kept visible while you search for others. **Ask** opens Claude when you need it. **Explore** returns selectable people with context; press Enter to open the first search result. Memory search includes linked names and works alongside circle, group, and judgment filters. No follow-up workflow or contact-date maintenance is required.

Unfinished add and memory drafts survive switching panels, separately for Demo and My people. Save or **Discard draft** clears them. Drafts live only in the current page and do not survive a refresh. Ask keeps its conversation and unsent question while you inspect a profile; changing universes or refreshing clears the conversation.

The map fills the available workspace. Star color identifies the spatial group. Every selected circle gets a colored ring segment. A numbered badge shows closeness: **1** just met, **2** acquaintance, **3** know well, **4** close, **5** inner circle. Star size reinforces closeness; a glow means high signal and a gold lightning mark means high agency. **Map key** explains the symbols and lists your current group/circle colors. Physical distance is layout, not a closeness score; circles overlap while spatial membership is exclusive.

`⌘K` / `Ctrl+K` opens search. `Escape` closes tools. Map stars support keyboard focus and Enter/Space. Zoom with the slider, scroll/pinch, or **+ / −**; **0** fits the map. Manual zoom takes priority over a pending automatic refit. Side handles slide tools in and out, resizing the map. Profiles, adding people, memories, settings, help, and the key all use the dock; there are no modal backdrops. The space scenery uses memoized SVG stars, nebulae, planets, rings, and a comet without an animation loop.

All selected judgment traits appear as symbols around each star. High signal has a bright white aura; high agency uses a larger gold bolt. Names retain a readable screen size and try alternate positions around people and group headings before hiding for lack of room. Hover or select a star to reveal its name. Selection pans only when needed to reveal the person, preserving manual zoom. Groups use seeded grids, staggered rows, hexagons, or orbits; settling stops after cooling and respects reduced-motion preferences.

## Data and recovery

- The demo uses `socialweb-demo-v1` in localStorage, with a session-local undo stack. Settings → Reset demo restores its fictional scenario. Demo mutations and name matching never call the personal API. Claude and personal backup controls are available in My people.
- Default database: `data/memory.db`; override with `DB_PATH`.
- Existing databases receive additive column migrations automatically. Legacy follow-up/contact fields are preserved in storage and backups, but removed from the interface and Claude context.
- Every supported mutation saves a transactional snapshot. **Undo** restores the previous state, including deleted people, linked memories, connections, and positions. History retains the last 25 mutations.
- Settings → Export backup saves version 2 JSON with all application tables. Restore validates the structure and runs in a transaction; it is also undoable. Version 1 JSON exports are not accepted by this new restore endpoint.
- Keep periodic exports outside the computer: undo is not a substitute for a separate backup.
- A pre-rebuild SQLite backup is in `data/backups/`. It is gitignored alongside the live DB and environment files.

Old co-mentions remain stored as memory evidence. They are no longer automatically rendered as friendship edges. Old explicit connections remain. The old unrestricted AI command endpoint returns 410, directing callers to profiles, memory capture, and Q&A.

## Architecture

Next.js 16.2.3 App Router, React 19, TypeScript, plain CSS, SQLite/Drizzle, Anthropic SDK, and a D3 force simulation rendered through SVG. The simulation cools to rest; it does not continuously animate decorative objects. UI responsibilities are split under `app/components/workspace/`, with pure layout utilities in `lib/graph/` and shared input/recovery helpers in `lib/`.

See [REBUILD_NOTES.md](REBUILD_NOTES.md) for the audit, mechanics, validation scope, and remaining limitations. `context.md`, the original `ARCHITECTURE.md`, and `Mechanics.md` describe the earlier prototype and are historical.

## Web deployment later

This is a local single-user build, not a publicly deployable private account system. Deploying requires authentication and a persistent database adapter. Do not deploy the file-backed SQLite database to a Vercel Function expecting durable storage: [Vercel documents that limitation](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

[Cloudflare D1](https://developers.cloudflare.com/d1/) supports SQLite semantics, but requires its Worker/HTTP API and a database adapter migration; `better-sqlite3` is not a drop-in D1 client. Vercel with a hosted SQL provider is another option. Keep API keys server-side in either case. Hosting free tiers do not include Claude API usage.
