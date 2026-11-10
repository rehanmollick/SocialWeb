# SocialWeb handoff

> Historical handoff, superseded after the user asked to resume the original task. The single failing test described below has been fixed, additional tests were added, and the production build has passed. Read `README.md` and `REBUILD_NOTES.md` for current behavior; rerun the checks for the latest working tree.

## Current state

This repo is mid-rebuild. The product direction is now a personal relationship map for finding and maintaining valuable people: high-signal people, high-agency people, close friends, collaborators, people who can help with UGC/content/startups/freelance/career/intros/life advice/going out, and people who need follow-up.

The old three-tab shell (landing, app, tokens) and the old 3,593-line canvas were removed. The app now opens directly into a focused workspace.

The user's original SQLite data was backed up before the schema changes:

`data/backups/before-revamp-20260920-204038.db`

Current personal DB was not intentionally seeded. It originally contained 1 person, 1 thought, and 1 mention.

## Product decisions from the user

- High signal and high agency are manual labels assigned by the user. Claude must never infer or assign them.
- Closeness is a separate 0–10 field.
- Each person has one spatial home/group. Dragging can change that home.
- People can belong to multiple overlapping circles/areas such as UGC, Content, Startups, Freelance, Career, Introductions, Life advice, Close friends, and Going out.
- Laptop/local first. Web deployment can come later, but local SQLite should not be treated as production-persistent on Vercel. Cloudflare D1 is a future migration option.
- Claude stays server-side through `ANTHROPIC_API_KEY`; it should answer from saved records and never execute unrestricted mutations.

## Implemented areas

- `app/page.tsx`: direct workspace entry.
- `app/components/workspace/Workspace.tsx`: main shell, navigation, filters, map/people/follow-up/memory views, settings, export/import, undo.
- `app/components/workspace/RelationshipMap.tsx`: SVG map, zoom, pan, node drag, group drag, spatial home changes, high-signal glow, high-agency marker.
- `app/components/workspace/PersonEditor.tsx`: profile editing, manual labels, closeness, spatial home, overlapping circles, description, last contact, next step, follow-up date, explicit connections, delete.
- `app/components/workspace/MemoryComposer.tsx`: reviewable memory capture, known-name suggestions, create profile for unknown suggested names, explicit person linking.
- `app/components/workspace/AssistantPanel.tsx`: read-only Claude Q&A with selected-person context and conversation history.
- `lib/graph/types.ts`, `lib/graph/layout.ts`: graph types, colors, group layout/bounds/drop target.
- `lib/history.ts`: transactional snapshots and 25-entry undo history.
- `lib/http.ts`, `lib/people.ts`: request validation/error handling.
- `app/api/memories`, `app/api/history`, `app/api/status`, graph/people/edges/bucket/snapshot routes.
- `lib/extract.ts`: Claude extracts only explicitly named people; no guessed qualities, closeness, groups, or relationships. Without a key, only exact names already in the database are suggested.
- `app/api/command/route.ts`: old unrestricted AI command runner is retired with HTTP 410.

## Important schema changes

`people` now has `circles`, `last_contact`, `follow_up`, and `next_step`. `lib/db/index.ts` performs runtime migrations for these columns and creates `history`.

The graph API returns parsed `tags` and `circles`. Co-mentions are no longer automatically returned as friendship edges. Explicit connections remain in `edge_overrides`.

## Verification status

`bun run typecheck` passes.

The Playwright suite is in `tests/workspace.spec.ts` and uses a disposable `/tmp/socialweb-e2e.db` through `playwright.config.ts`.

Latest test result before this handoff:

- Test 2 passes: invalid writes are rejected, failed restore is atomic, delete/undo and backup restore work.
- Test 3 passes: spatial drag persists, circles survive movement, group filters render.
- Test 1 fails only because the assertion uses `getByRole('status')` while both the global saving status and the memory suggestion notice have that role. The app behavior itself saved the memory. Fix the test to target the global footer status specifically, or remove `role="status"` from the non-live suggestion paragraph.

The test command is:

```bash
bun run test
```

Build/type commands:

```bash
bun run typecheck
bun run build
```

The app uses webpack in `package.json` and `playwright.config.ts` because the previous Turbopack/PostCSS setup spawned excessive workers in this environment. `postcss.config.mjs` intentionally exports an empty plugin object because the new CSS is plain CSS.

## Exact next steps

1. Fix the single Playwright assertion ambiguity described above.
2. Run `bun run test`, `bun run typecheck`, and `bun run build` until all pass.
3. Open the app in a browser at `http://127.0.0.1:3000` and visually inspect at desktop width. Check empty state, populated map, profile editor, memory modal, settings, and mobile-width fallback.
4. Manually verify adding a person, toggling high signal/high agency, adding two circles, saving a memory, editing a memory, adding/removing an explicit connection, dragging into a group, dragging outside groups, undo, export, invalid restore, and reload persistence.
5. Check all API responses for user-facing errors. Do not reintroduce automatic AI mutations or automatic closeness increases.
6. Update README with the new workflow and local setup. Mention `ANTHROPIC_API_KEY` is server-side only.
7. Consider a later deployment branch: replace `better-sqlite3` with a persistent hosted database (Cloudflare D1 or Postgres/Turso) and add private authentication before exposing personal data publicly. Do not claim Vercel local SQLite is durable.

## Useful commands

```bash
bun install
cp .env.example .env.local
# add ANTHROPIC_API_KEY to .env.local if Claude is desired
bun run dev
```

For disposable seed data only:

```bash
DB_PATH=/tmp/socialweb-seed.db bun run scripts/seed-dense.ts
```

The seed script intentionally refuses to target `data/memory.db`.

## Constraints

Read `AGENTS.md` before changing Next.js code. This repository uses Next.js 16.2.3, React 19, App Router route handlers, and async dynamic route params. Preserve the backup and do not delete the user's personal database. Avoid reintroducing the removed landing/tokens pages unless the user explicitly changes direction.
