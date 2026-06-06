// Thin client for the official Supercell Clash Royale API.
// Docs: https://developer.clashroyale.com  ·  Base: https://api.clashroyale.com/v1
const API_BASE = 'https://api.clashroyale.com/v1';
const TOKEN = (process.env.CR_API_TOKEN || '').trim();

// No token -> the app runs entirely on simulated data (see poller.js / startMock).
export const isMock = !TOKEN;

async function apiGet(path) {
  const res = await fetch(API_BASE + path, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`CR API ${res.status} ${res.statusText} on ${path} :: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Supercell battleTime looks like "20240115T143000.000Z". Turn it into a Date.
export function parseBattleTime(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
  const [, Y, Mo, D, H, Mi, S] = m;
  return new Date(`${Y}-${Mo}-${D}T${H}:${Mi}:${S}Z`);
}

// Top ranked players (global ladder leaderboard).
export async function getTopPlayers(limit = 200) {
  const data = await apiGet(`/locations/global/rankings/players?limit=${limit}`);
  return (data.items || []).map((p) => ({
    tag: p.tag,
    name: p.name,
    rank: p.rank,
    trophies: p.trophies ?? p.eloRating ?? null,
  }));
}

// A player's most-recent finished battle: when, which deck, mode, win/loss.
export async function getLastBattle(tag) {
  const battles = await apiGet(`/players/${encodeURIComponent(tag)}/battlelog`);
  if (!Array.isArray(battles) || battles.length === 0) return null;
  let best = null, bestT = -1;
  for (const b of battles) {
    const d = parseBattleTime(b.battleTime);
    if (d && d.getTime() > bestT) { bestT = d.getTime(); best = b; }
  }
  if (!best) return null;
  const me = (best.team && best.team[0]) || {};
  const opp = (best.opponent && best.opponent[0]) || {};
  const deck = (me.cards || []).map((c) => ({
    name: c.name,
    level: c.level ?? null,
    elixir: c.elixirCost ?? null,
    iconUrl: c.iconUrls?.medium || null,
  }));
  const myCrowns = me.crowns ?? 0, oppCrowns = opp.crowns ?? 0;
  return {
    lastBattleTime: parseBattleTime(best.battleTime),
    deck,
    mode: best.gameMode?.name || best.type || null,
    win: myCrowns > oppCrowns ? true : myCrowns < oppCrowns ? false : null,
    opponentName: opp.name || null,
  };
}
