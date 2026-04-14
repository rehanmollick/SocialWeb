# social web

Your social graph as memory. Drop thoughts, Claude extracts people, the graph grows.

## Stack

- Next.js 16 (App Router) + Bun
- TypeScript + Tailwind v4
- SQLite via better-sqlite3 + Drizzle ORM
- Anthropic Claude Haiku for extraction (stubbed if no API key)
- d3-force canvas visualization

## Setup

```bash
cp .env.example .env
# paste your ANTHROPIC_API_KEY into .env
bun install
bun run dev
```

Open http://localhost:3000.

## How it works

1. Type a note: *"grabbed coffee with Sarah and Mike, talked about climbing"*
2. `POST /api/thought` → Claude Haiku extracts `[{name, bg, tags, strengthHint}]`
3. People get upserted in SQLite, a `thought` row is stored, and `mention` rows link people to the thought. Co-mentions become edges.
4. `GET /api/graph` returns `{nodes, edges}`. The canvas re-fetches and d3-force does the rest.

## Data

- `data/memory.db` — SQLite file, auto-created on first run. Gitignored.
- Tables: `people`, `thoughts`, `mentions`.

## Buckets

`plano · ut · allen · sf · family · climb · online` — each gets a cluster anchor and color. Add more by editing `BG_ORDER` in `app/canvas.tsx` and the extraction prompt in `lib/extract.ts`.

## Without an API key

The extractor falls back to a regex stub that pulls capitalized words as names. Good enough to test the loop offline.
