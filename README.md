# 91Snipe — who just played (Clash Royale)

A real-time web app that shows, **of the top-200 ranked Clash Royale players, who just
finished a ranked match in the last 5–10 minutes** — with the exact deck they played and a
one-click jump to their [RoyaleAPI](https://royaleapi.com) history. Built to feel like
RoyaleAPI but **live and fast**: the page updates the instant a new match ends (Server-Sent
Events).

The point: see who's active *right now* — who just played, and who (having just finished and
not yet shown a newer game) is **likely matching or already in their next game** — i.e. who
you might run into in the next few minutes.

## Features

- **Ranked-only tracking** — only Path of Legends (ranked 1v1) battles count; ladder,
  friendlies, clan war and challenges are ignored.
- **Full RoyaleAPI-style decks** — real card art with **correct card levels** (normalized to
  the in-game 1–16 scale). Evolutions are shown with the right form for their level:
  **evolution / Lv1** in pink (`evolutionMedium` art) and **hero / Lv2** in gold (`heroMedium`
  art), each with a diamond marker — plus **champion** cards in violet, the **tower troop**,
  average elixir and 4-card cycle.
- **Copy deck / open in game** — one click copies the official `link.clashroyale.com` deck
  link or opens it straight in the game.
- **Crown score, opponent, Elo & clan** for each player's last game.
- **Filters & sort** — search by name / clan / tag, "matching only", Top-N rank filter, and
  sort by recency or rank.
- **Snipe alerts** — optional sound + desktop notification the moment a tracked player (within
  your rank filter) just played.
- **Bilingual** — English / 中文 toggle; all preferences persist locally.

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

- `src/crClient.js` — Supercell API client. Loads the `/cards` reference once (card rarity,
  level scale, evolution art), fetches the Path of Legends top-200, and normalizes each
  player's last **ranked** battle into deck + levels + evolution/champion flags + tower troop
  + crown score + opponent + a copy-deck link.
- `src/poller.js` — background loop: refreshes the leaderboard every 5 min, then continuously
  sweeps battlelogs (bounded concurrency, tunable for rate limits). Mock mode simulates this.
- `src/store.js` — in-memory state + an event bus; `recent(window)` returns active players.
- `src/server.js` — dependency-free HTTP server:
  - `GET /api/recent?window=5` — JSON snapshot
  - `GET /api/stream?window=5` — **SSE** push on every update (what the UI uses)
  - `GET /api/meta` — mock flag, defaults
- `public/` — the RoyaleAPI-style auto-updating UI (vanilla JS, no build step).

### Card levels (the math)

Clash Royale shows every card on one unified scale. The API returns a *rarity-relative*
`level` plus that rarity's `maxLevel`; the displayed level is `level + (BASE - maxLevel)`,
where `BASE` is the common rarity's `maxLevel` (currently 16 — every maxed card reads 16).
This is why a maxed champion is **16**, not the raw `6` the API reports.

## Tune (in `.env`)

`WINDOW_MINUTES`, `LEADERBOARD_LIMIT`, `LEADERBOARD_REFRESH_MS`, `POLL_CONCURRENCY`,
`POLL_CYCLE_DELAY_MS`. Lower the concurrency / raise the cycle delay if you hit API rate limits.

## Test

```bash
npm test
```

### Evolution (Lv1) vs hero (Lv2) vs champion

An evolution has two forms keyed by `evolutionLevel`: **Lv1 = "evolution"** (purple
`evolutionMedium` art) and **Lv2 = "hero"** (gold `heroMedium` art — Supercell's own field
name). The app picks the art by level (`evoLevel >= 2 ? heroMedium : evolutionMedium`), so a
Lv2 card shows its gold hero form, not the purple Lv1 form. Like RoyaleAPI, it shows **all**
evolutions a deck carries (commonly 2–3) — pink for Lv1, gold for Lv2, each with a diamond.
**Champions** (the `champion` rarity — Skeleton King, Archer Queen, …) are a separate thing,
rendered in violet with a ♛. (In a battle only 2 evolutions are *active*, but the deck loadout
shows what it owns, which is what RoyaleAPI displays.)

## Rate limits & data completeness

Both participants of a ranked match are recorded, so if you monitor enough ranks you'll see
matches **in pairs** — each player pointing at the other, same battle time, opposite result.
This only works if the data is *complete*, so polling must respect the API throttle:

- `apiGet` **retries 429 / 5xx with exponential backoff + jitter** instead of dropping the fetch
  (dropping = missing players = broken pairs).
- Each sweep logs **coverage** (`swept 1000/1000 (100%) · N played · X throttled · Y failed`)
  so incomplete data is visible, never silent.
- `POLL_CONCURRENCY=6` keeps ~1000 players under the throttle. Raise it if you monitor fewer
  ranks (faster sweeps); lower it if you still see `throttled` in the logs.

## Known limits / next ideas

- We only know about **finished** battles. A 🔴 "just finished" player *may* be queuing — but the
  API can't tell us if they've already started their next game (in which case you can't meet them
  in ranked). The app states this clearly.
- Mutual "most-recent-vs-each-other" pairs are inherently brief — players requeue within seconds —
  so a snapshot shows relatively few; both participants still appear as *recently active*.
- In-memory store (resets on restart); fine for a live view, add Redis for history.
