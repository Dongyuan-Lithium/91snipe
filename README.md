# CR Live — who just played (Clash Royale)

A real-time web app that shows, **of the top-200 ranked Clash Royale players, who just
finished a match in the last 5–10 minutes** — with the deck they used and a one-click jump
to their [RoyaleAPI](https://royaleapi.com) battle history. Built to feel like RoyaleAPI but
**live and fast**: the page updates the instant a new match ends (Server-Sent Events).

The point: see who's active *right now* — who just played, and who (having just finished and
not yet shown a newer game) is **likely matching or already in their next game** — i.e. who
you might run into in the next few minutes.

## Run it (zero install)

Requires **Node 18+** (uses built-in `fetch`, `http`, and the test runner — no dependencies).

```bash
cd ~/ideas/projects/clash-royale-live-tracker
npm start
# open http://localhost:3000
```

With no API token it starts in **MOCK mode** — a simulated live stream of finished matches —
so you can see the whole thing working immediately.

## Live data (Supercell API)

1. Go to **https://developer.clashroyale.com**, log in, **create an API key**, and whitelist
   the **public IP** of the machine that will run this (`curl https://ifconfig.me`).
2. `cp .env.example .env` and put the token in `CR_API_TOKEN=...`.
3. `npm start` → it switches to **REAL** data automatically.

> Heads-up: the official API only exposes *finished* battles, so "in a game right now" is
> **inferred** — a player whose last battle ended <2 min ago and who hasn't surfaced a newer
> one is flagged 🔴 (very likely queuing / mid-game). That's the closest the API allows.

## How it works

- `src/crClient.js` — Supercell API client (top-200 leaderboard + each player's last battle).
- `src/poller.js` — background loop: refreshes the leaderboard every 5 min, then continuously
  sweeps battlelogs (bounded concurrency, tunable for rate limits). Mock mode simulates this.
- `src/store.js` — in-memory state + an event bus; `recent(window)` returns active players.
- `src/server.js` — dependency-free HTTP server:
  - `GET /api/recent?window=5` — JSON snapshot
  - `GET /api/stream?window=5` — **SSE** push on every update (what the UI uses)
  - `GET /api/meta` — mock flag, defaults
- `public/` — the RoyaleAPI-style auto-updating UI.

## Tune (in `.env`)

`WINDOW_MINUTES`, `LEADERBOARD_LIMIT`, `LEADERBOARD_REFRESH_MS`, `POLL_CONCURRENCY`,
`POLL_CYCLE_DELAY_MS`. Lower the concurrency / raise the cycle delay if you hit API rate limits.

## Test

```bash
npm test
```

## Known limits / next ideas

- "In game now" is inferred (see above) — could be sharpened by tracking battle-count deltas.
- Global leaderboard only; could add regional / Path-of-Legends leaderboards.
- Card art: shown as names for reliability; could add RoyaleAPI/Supercell card icons.
- In-memory store (resets on restart); fine for a live view, add Redis for history.
