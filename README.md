# SocialWeb

A private map of the people in your life: who they are to you, what you do
together, and what you want to do next. Local-first; your data is one SQLite
file on your computer.

## Run it

```bash
bun install
cp .env.example .env.local   # add ANTHROPIC_API_KEY for the Claude features
bun run dev                  # http://127.0.0.1:3000
```

Everything except the Claude features works without a key.

## How it works

- **Where they're from** groups people by how you know them (Friends,
  Classmates, ...). Drag
  someone into a group to move them, into empty space to start a new group.
  People stay exactly where you drop them.
- **What's going on** groups the same people by circle: what you do together or have going
  on ("Startups", "Halloween Afterparty"). A person shows up once per circle.
  Drag someone into a circle to add them, out of it to remove them.
- A **line from you** to someone means you are close; it gets thicker the
  closer you are. Set closeness in their profile.
- **Profile** (click anyone) opens on a bullet notes box and a next step. Labels,
  closeness, group and connections sit behind folds.
- **Brain dump** takes free text ("had coffee with Sam, he wants help with
  content...") and Claude sorts it onto the right profiles. You review, then it
  saves as one change.
- **Radar** lists open next steps, people who matter that you have not touched
  in a while, and profiles that are still blank.
- **Ask** answers questions from your saved notes.
- **Undo** reverses the last 25 changes. Settings has export and restore.

Claude only ever suggests. Circles and next steps it proposes appear as chips
you tap to accept, and a brain dump is not saved until you confirm it. It never
assigns labels like high signal or closeness.

## On your phone

The app is deployed on Vercel with a Turso (libSQL) database, behind a passcode.
Open the Vercel URL on any device and enter `APP_PASSCODE` from `.env.local`.
Redeploy with `vercel deploy --prod`.

With `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env.local`, the app on
this computer uses the same hosted data, so every device sees the same thing.
Remove them (or set `DB_PATH`) to work against a local `data/memory.db` instead.

`bun run phone` is the no-cloud alternative: it serves the app from this
computer to your network behind the same passcode.

## Development

```bash
bun run typecheck
bun run test    # Playwright, against a disposable DB in /tmp
bun run build
```

Use the webpack scripts in `package.json`. Do not run plain `next dev`: Turbopack
spawns enough workers here to exhaust memory. Run one server at a time.

`DB_PATH` points the app at another database, which is how to try things against
a copy of your data. `REBUILD_NOTES.md` has the design history.

Next.js here is 16.x; read `AGENTS.md` before changing framework code.
