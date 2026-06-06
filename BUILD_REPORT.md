# Build report — CR Live (Clash Royale "who just played")

## What it is
A real-time website: of the **top-200 ranked players**, it shows **who just finished a match
in the last 5 / 10 minutes**, the **deck** they used, win/loss, and a **one-click link to their
RoyaleAPI** history. RoyaleAPI-inspired dark UI, updates **live** via Server-Sent Events the
instant a new match ends. Surfaces who's likely **matching / in their next game right now**.

## What works (verified)
- ✅ `npm test` — 4/4 pass (timestamp parsing, recent-window filter + sort, "matching" flag, RoyaleAPI URL).
- ✅ Server boots, serves the UI (HTTP 200), and all endpoints respond:
  - `/api/meta`, `/api/recent?window=5|10`, `/api/stream` (SSE) — confirmed returning live data.
- ✅ Runs **out of the box in MOCK mode** (no token) with a simulated live stream — 12 active
  players returned in a 10-min window during the test, with decks + statuses.
- ✅ Auto-refresh: SSE pushes a new frame on every poll/mock tick; UI also ticks "Xs ago" each second.
- ✅ Dependency-free (built-in Node `http`) — `npm start` works with **no install**. Node 18+.

## How to run
```bash
cd ~/ideas/projects/clash-royale-live-tracker
npm start            # → http://localhost:3000  (MOCK data)
npm test
```

## To get REAL data (one thing only I can't do for you)
The official Supercell API needs **your** token, IP-whitelisted:
1. https://developer.clashroyale.com → create a key → whitelist your machine's public IP.
2. `cp .env.example .env`, set `CR_API_TOKEN=...`, then `npm start` → switches to REAL data automatically.

## Honest limitations
- **"In game now" is inferred.** The API only exposes *finished* battles, so a player whose last
  battle ended <2 min ago and who hasn't surfaced a newer one is flagged 🔴 "likely matching / in
  game." There is no official "currently in a match" signal.
- **Rate limits:** sweeping 200 battlelogs continuously is heavy; concurrency + cycle delay are
  tunable in `.env`. A busy key may need higher limits or a longer cycle.
- Global leaderboard only (could add regional / Path-of-Legends); card art shown as names for
  reliability; in-memory store resets on restart.

## Files
`src/{server,crClient,poller,store,loadEnv}.js` · `public/{index.html,app.js,styles.css}` ·
`test/store.test.js` · `README.md` · `.env.example`
