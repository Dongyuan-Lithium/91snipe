// Background pollers that keep the store fresh. Real mode hits the Supercell API;
// mock mode simulates a live stream of finished matches so the app works with no token.
import * as store from './store.js';
import { getTopPlayers, getLastBattle, loadCards } from './crClient.js';

const LIMIT = Number(process.env.LEADERBOARD_LIMIT || 200);
const CONCURRENCY = Number(process.env.POLL_CONCURRENCY || 8);
const LEADERBOARD_REFRESH_MS = Number(process.env.LEADERBOARD_REFRESH_MS || 300000);
const CYCLE_DELAY_MS = Number(process.env.POLL_CYCLE_DELAY_MS || 1500);

let topTags = [];

// Run `worker` over `items` with bounded concurrency (rate-limit friendly).
async function pool(items, worker, concurrency) {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx]); } catch { /* per-item failure, keep sweeping */ }
    }
  });
  await Promise.all(runners);
}

async function refreshLeaderboard(log) {
  const top = await getTopPlayers(LIMIT);
  topTags = top.map((p) => p.tag);
  for (const p of top) store.upsert({
    tag: p.tag, name: p.name, rank: p.rank,
    trophies: p.trophies, expLevel: p.expLevel, clanName: p.clanName,
  });
  log.log(`[poller] leaderboard refreshed: ${topTags.length} players`);
}

// Sweep every tracked player's battlelog. Returns coverage stats so throttling /
// failures are VISIBLE (previously they were silently swallowed, leaving incomplete
// data — missing players and broken opponent pairs).
async function sweepBattles(log = console) {
  let ok = 0, played = 0, throttled = 0, failed = 0;
  await pool(topTags, async (tag) => {
    try {
      const last = await getLastBattle(tag);
      ok++;
      if (last) { store.upsert({ tag, ...last }); played++; }
    } catch (e) {
      if (e && e.status === 429) throttled++; else failed++;
    }
  }, CONCURRENCY);
  store.notifyUpdated();
  const total = topTags.length || 1;
  const coverage = Math.round((100 * ok) / total);
  if (throttled || failed) {
    log.log(`[battles] swept ${ok}/${total} (${coverage}% coverage) · ${played} recently played · ${throttled} throttled · ${failed} failed`);
  }
  return { total, ok, played, throttled, failed, coverage };
}

export async function startReal(log = console) {
  log.log('[poller] REAL mode (live Supercell Clash Royale API)');
  const cards = await loadCards();
  log.log(`[poller] card reference loaded: ${cards.count} cards, level scale 1-${cards.levelBase}` +
    (cards.error ? ` (ref fetch failed: ${cards.error}; using per-battle maxLevel)` : ''));
  try { await refreshLeaderboard(log); } catch (e) { log.error('[leaderboard]', e.message); }
  setInterval(() => refreshLeaderboard(log).catch((e) => log.error('[leaderboard]', e.message)), LEADERBOARD_REFRESH_MS);
  const loop = async () => {
    try { await sweepBattles(log); } catch (e) { log.error('[battles]', e.message); }
    setTimeout(loop, CYCLE_DELAY_MS);
  };
  loop();
}

// ---------------- mock mode ----------------
// name, elixir, rarity, and whether the card can be played as an evolution.
const MOCK_CARDS = [
  ['Hog Rider', 4, 'rare', false], ['Fireball', 4, 'rare', false], ['Musketeer', 4, 'rare', true],
  ['Ice Spirit', 1, 'common', true], ['Skeletons', 1, 'common', true], ['Cannon', 3, 'common', false],
  ['The Log', 2, 'legendary', false], ['Ice Golem', 2, 'rare', false], ['Mega Knight', 7, 'legendary', false],
  ['Bandit', 3, 'legendary', false], ['Royal Ghost', 3, 'legendary', false], ['Zap', 2, 'common', true],
  ['Electro Wizard', 4, 'legendary', false], ['Goblin Barrel', 3, 'epic', false], ['Princess', 3, 'legendary', false],
  ['Rocket', 6, 'rare', false], ['Knight', 3, 'common', true], ['Valkyrie', 4, 'rare', true],
  ['Baby Dragon', 4, 'epic', false], ['Balloon', 5, 'epic', false], ['Miner', 3, 'legendary', false],
  ['Poison', 4, 'epic', false], ['Tornado', 3, 'epic', false], ['Bowler', 5, 'epic', false],
  ['Inferno Dragon', 4, 'legendary', false], ['Goblin Gang', 3, 'common', false], ['Tesla', 4, 'common', true],
  ['P.E.K.K.A', 7, 'epic', false], ['Giant', 5, 'rare', true], ['X-Bow', 6, 'epic', false],
  ['Mortar', 4, 'common', true], ['Royal Giant', 6, 'common', true], ['Firecracker', 3, 'common', true],
];
const MOCK_CHAMPIONS = [['Archer Queen', 5], ['Golden Knight', 4], ['Skeleton King', 4], ['Mighty Miner', 4], ['Little Prince', 3]];
const MOCK_TOWERS = ['Tower Princess', 'Cannoneer', 'Dagger Duchess', 'Royal Chef'];

function pick(arr, n) {
  const c = [...arr]; const out = [];
  for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  return out;
}
function mockDeck() {
  const withChamp = Math.random() < 0.4;
  const base = pick(MOCK_CARDS, withChamp ? 7 : 8);
  const cards = base.map(([name, elixir, rarity, canEvo]) => {
    const evolution = canEvo && Math.random() < 0.45;
    const evolutionLevel = evolution ? (Math.random() < 0.5 ? 2 : 1) : 0; // mix of Lv1/Lv2 like RoyaleAPI
    return {
      name, elixir, rarity,
      level: 14 + Math.floor(Math.random() * 3),        // 14..16 (already display level)
      maxLevel: 16, evolution, evolutionLevel, champion: false,
      iconUrl: null,                                     // no art without a token -> styled tile
    };
  });
  if (withChamp) {
    const [name, elixir] = MOCK_CHAMPIONS[Math.floor(Math.random() * MOCK_CHAMPIONS.length)];
    cards.unshift({ name, elixir, rarity: 'champion', level: 16, maxLevel: 16, evolution: false, evolutionLevel: 0, champion: true, iconUrl: null });
  }
  return cards;
}
function seedMock() {
  for (let r = 1; r <= 200; r++) {
    store.upsert({ tag: '#MOCK' + String(r).padStart(4, '0'), name: 'TopPlayer ' + r, rank: r,
      trophies: 9000 - r * 9, clanName: 'Mock Clan ' + (1 + (r % 12)) });
  }
}
function mockTick() {
  const n = 8 + Math.floor(Math.random() * 12);
  for (let i = 0; i < n; i++) {
    const r = 1 + Math.floor(Math.random() * 200);
    const agoSec = Math.floor(Math.pow(Math.random(), 2) * 600); // bias toward "just now"
    const my = Math.floor(Math.random() * 4), op = Math.random() < 0.5 ? Math.floor(Math.random() * my || 0) : my + 1 + Math.floor(Math.random() * 2);
    const oppCrowns = Math.min(3, op);
    store.upsert({
      tag: '#MOCK' + String(r).padStart(4, '0'),
      name: 'TopPlayer ' + r,
      rank: r,
      lastBattleTime: new Date(Date.now() - agoSec * 1000),
      deck: mockDeck(),
      towerTroop: { name: MOCK_TOWERS[Math.floor(Math.random() * MOCK_TOWERS.length)], level: 16, iconUrl: null },
      deckLink: null,
      mode: 'Ranked',
      crowns: my, oppCrowns,
      win: my > oppCrowns ? true : my < oppCrowns ? false : null,
      opponentName: 'Rival ' + (1 + Math.floor(Math.random() * 999)),
    });
  }
  store.notifyUpdated();
}
export function startMock(log = console) {
  log.log('[poller] MOCK mode — simulated data (set CR_API_TOKEN for live data)');
  seedMock();
  mockTick();
  setInterval(mockTick, 2500);
}
