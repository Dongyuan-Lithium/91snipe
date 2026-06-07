// Thin client for the official Supercell Clash Royale API.
// Docs: https://developer.clashroyale.com  ·  Base: https://api.clashroyale.com/v1
const API_BASE = 'https://api.clashroyale.com/v1';
const TOKEN = (process.env.CR_API_TOKEN || '').trim();

// No token -> the app runs entirely on simulated data (see poller.js / startMock).
export const isMock = !TOKEN;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET with retry+backoff on throttling (429) and transient 5xx. The official API
// throttles bursts; silently dropping those fetches (as the poller did) leaves the
// tracker with INCOMPLETE data — missing players and broken opponent pairs — so we
// retry instead. Exported so the retry behaviour is unit-tested.
export async function apiGet(path) {
  const maxRetries = Number(process.env.CR_MAX_RETRIES ?? 4);
  const baseMs = Number(process.env.CR_RETRY_BASE_MS ?? 300);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_BASE + path, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
    });
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const retryAfter = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
      const delay = retryAfter > 0
        ? retryAfter * 1000
        : Math.round(baseMs * 2 ** attempt * (0.8 + Math.random() * 0.4)); // exp backoff + jitter
      await sleep(delay);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`CR API ${res.status} ${res.statusText} on ${path} :: ${String(body).slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
}

// Supercell battleTime looks like "20240115T143000.000Z". Turn it into a Date.
export function parseBattleTime(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
  const [, Y, Mo, D, H, Mi, S] = m;
  return new Date(`${Y}-${Mo}-${D}T${H}:${Mi}:${S}Z`);
}

// ---------------- card reference ----------------
// Clash Royale shows every card on one unified level scale. The API returns a
// rarity-relative `level` plus the rarity's `maxLevel`; the displayed level is
// `level + (BASE - maxLevel)` where BASE is the common rarity's maxLevel (the top
// of the unified scale, currently 16 — all maxed cards read BASE). We fetch /cards
// once to learn BASE robustly and to grab evolution artwork by id.
let cardIndex = new Map(); // id -> { rarity, maxLevel, name, elixir, medium, evolutionMedium }
let levelBase = 16;        // recomputed from /cards; safe default if the call fails

export async function loadCards() {
  try {
    const data = await apiGet('/cards');
    const items = data.items || [];
    const idx = new Map();
    let base = 0;
    for (const c of items) {
      base = Math.max(base, c.maxLevel || 0);
      idx.set(c.id, {
        rarity: c.rarity,
        maxLevel: c.maxLevel,
        name: c.name,
        elixir: c.elixirCost ?? null,
        medium: c.iconUrls?.medium || null,
        // Two evolved arts: `evolutionMedium` is the Lv1 evolution form (purple);
        // `heroMedium` is the Lv2 "hero" form (gold). Some newer cards ship only one.
        evolutionMedium: c.iconUrls?.evolutionMedium || null,
        heroMedium: c.iconUrls?.heroMedium || null,
      });
    }
    cardIndex = idx;
    if (base > 0) levelBase = base;
    return { count: idx.size, levelBase };
  } catch (e) {
    // Non-fatal: per-battle maxLevel still lets us normalize levels.
    return { count: 0, levelBase, error: e.message };
  }
}

export function getLevelBase() { return levelBase; }

// Normalize one battlelog card into the shape the UI needs. Like RoyaleAPI, we show
// every evolution the deck carries, color-coded by evolution LEVEL (1 = Lv1, 2 = Lv2).
function normalizeCard(c) {
  const ref = cardIndex.get(c.id) || {};
  const maxLevel = c.maxLevel ?? ref.maxLevel ?? levelBase;
  const rarity = c.rarity || ref.rarity || 'common';
  const isChamp = rarity === 'champion';
  const evoLevel = isChamp ? 0 : (c.evolutionLevel ?? 0); // champions are never evolutions
  const evolved = evoLevel >= 1;
  const evoMed = c.iconUrls?.evolutionMedium || ref.evolutionMedium || null;
  const heroMed = c.iconUrls?.heroMedium || ref.heroMedium || null;
  const baseArt = c.iconUrls?.medium || ref.medium || null;
  // Lv2 = "hero" form (gold art) -> prefer heroMedium; Lv1 = evolution form (purple).
  const evoArt = evoLevel >= 2 ? (heroMed || evoMed) : (evoMed || heroMed);
  return {
    id: c.id,
    name: c.name,
    rarity,
    level: (c.level ?? 1) + (levelBase - maxLevel), // displayed (unified) level
    maxLevel: levelBase,
    elixir: c.elixirCost ?? ref.elixir ?? null,
    evolution: evolved,
    evolutionLevel: evolved ? evoLevel : 0,
    champion: isChamp,
    starLevel: c.starLevel ?? 0,
    iconUrl: (evolved && evoArt) ? evoArt : baseArt,
    // fallback if the evolved art 404s on the CDN (e.g. Princess) — show the base card art
    baseIconUrl: baseArt,
  };
}

// A battle counts as "ranked" only if it's a Path of Legends (ranked 1v1) match.
// Everything else — ladder/trail, friendlies, clan war, challenges — is ignored so
// the tracker reflects competitive ranked play, not casual games.
export function isRankedBattle(b) {
  return b?.type === 'pathOfLegend';
}

// Official in-game "copy deck" deep link from the 8 card ids (+ tower troop).
function deckLink(cardIds, towerId) {
  if (!cardIds.length) return null;
  let url = 'https://link.clashroyale.com/deck/en?deck=' + cardIds.join(';');
  if (towerId) url += '&tt=' + towerId;
  return url;
}

// Top ranked players. The classic trophy ladder was removed from Clash Royale in
// late 2023; the live global leaderboard is now "Path of Legends" (ranked by eloRating).
export async function getTopPlayers(limit = 200) {
  const data = await apiGet(`/locations/global/pathoflegend/players?limit=${limit}`);
  return (data.items || []).map((p) => ({
    tag: p.tag,
    name: p.name,
    rank: p.rank,
    trophies: p.eloRating ?? p.trophies ?? null,
    expLevel: p.expLevel ?? null,
    clanName: p.clan?.name || null,
  }));
}

// A player's most-recent finished RANKED battle: when, which deck, mode, win/loss,
// crown score, opponent, tower troop, and a copy-deck link.
// Returns null if their latest battles are all non-ranked (so they won't surface).
export async function getLastBattle(tag) {
  const battles = await apiGet(`/players/${encodeURIComponent(tag)}/battlelog`);
  if (!Array.isArray(battles) || battles.length === 0) return null;
  let best = null, bestT = -1;
  for (const b of battles) {
    if (!isRankedBattle(b)) continue;
    const d = parseBattleTime(b.battleTime);
    if (d && d.getTime() > bestT) { bestT = d.getTime(); best = b; }
  }
  if (!best) return null;

  const me = (best.team && best.team[0]) || {};
  const opp = (best.opponent && best.opponent[0]) || {};
  const deck = (me.cards || []).map(normalizeCard);
  const tower = (me.supportCards && me.supportCards[0]) || null;
  const towerTroop = tower ? {
    name: tower.name,
    level: tower.level ?? null,
    iconUrl: tower.iconUrls?.medium || null,
  } : null;
  const myCrowns = me.crowns ?? 0, oppCrowns = opp.crowns ?? 0;

  return {
    lastBattleTime: parseBattleTime(best.battleTime),
    deck,
    towerTroop,
    deckLink: deckLink(deck.map((c) => c.id).filter(Boolean), tower?.id),
    mode: 'Ranked', // only ranked battles reach here (see isRankedBattle)
    crowns: myCrowns,
    oppCrowns,
    win: myCrowns > oppCrowns ? true : myCrowns < oppCrowns ? false : null,
    opponentName: opp.name || null,
    opponentTag: opp.tag || null,
  };
}
