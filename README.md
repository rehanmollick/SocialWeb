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

- **Map** groups people by how you know them (Friends, Classmates, ...). Drag
  someone into a group to move them, into empty space to start a new group.
  People stay exactly where you drop them.
- **Doing** groups the same people by circle: what you do together or have going
  on ("Startups", "Halloween Afterparty"). A person shows up once per circle.
  Drag someone into a circle to add them, out of it to remove them.
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

```bash
bun run phone
```

This builds once, creates a passcode in `.env.local` if there is none, prints
the address to open, and serves the app to your network. Phones start on the
People list.

- Same Wi-Fi: open the printed address and enter the passcode.
- Anywhere, or on networks that block device-to-device traffic (most campus
  Wi-Fi): install [Tailscale](https://tailscale.com) (free) on the computer and
  the phone and use the computer's Tailscale address with the same port.

The computer has to be on and running the app. The connection on a shared Wi-Fi
is plain HTTP, so prefer Tailscale outside your home network.

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
