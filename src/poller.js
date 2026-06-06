// Background pollers that keep the store fresh. Real mode hits the Supercell API;
// mock mode simulates a live stream of finished matches so the app works with no token.
import * as store from './store.js';
import { getTopPlayers, getLastBattle } from './crClient.js';

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
  for (const p of top) store.upsert({ tag: p.tag, name: p.name, rank: p.rank });
  log.log(`[poller] leaderboard refreshed: ${topTags.length} players`);
}

async function sweepBattles() {
  await pool(topTags, async (tag) => {
    const last = await getLastBattle(tag);
    if (last) store.upsert({ tag, ...last });
  }, CONCURRENCY);
  store.notifyUpdated();
}

export async function startReal(log = console) {
  log.log('[poller] REAL mode (live Supercell Clash Royale API)');
  try { await refreshLeaderboard(log); } catch (e) { log.error('[leaderboard]', e.message); }
  setInterval(() => refreshLeaderboard(log).catch((e) => log.error('[leaderboard]', e.message)), LEADERBOARD_REFRESH_MS);
  const loop = async () => {
    try { await sweepBattles(); } catch (e) { log.error('[battles]', e.message); }
    setTimeout(loop, CYCLE_DELAY_MS);
  };
  loop();
}

// ---------------- mock mode ----------------
const MOCK_CARDS = ['Hog Rider','Fireball','Musketeer','Ice Spirit','Skeletons','Cannon','The Log','Ice Golem','Mega Knight','Bandit','Royal Ghost','Battle Ram','Zap','Electro Wizard','Goblin Barrel','Princess','Rocket','Knight','Valkyrie','Baby Dragon','Wizard','Balloon','Lava Hound','Miner','Poison','Tornado','Bowler','Executioner','Inferno Dragon','Magic Archer','Goblin Gang','Tesla','P.E.K.K.A','Golem','Giant','Sparky','X-Bow','Mortar','Royal Giant','Elite Barbarians'];
const MODES = ['Ladder', 'Path of Legends', 'Ranked 1v1'];

function pick(arr, n) {
  const c = [...arr]; const out = [];
  for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  return out;
}
function seedMock() {
  for (let r = 1; r <= 200; r++) {
    store.upsert({ tag: '#MOCK' + String(r).padStart(4, '0'), name: 'TopPlayer ' + r, rank: r });
  }
}
function mockTick() {
  const n = 8 + Math.floor(Math.random() * 12);
  for (let i = 0; i < n; i++) {
    const r = 1 + Math.floor(Math.random() * 200);
    const agoSec = Math.floor(Math.pow(Math.random(), 2) * 600); // bias toward "just now"
    store.upsert({
      tag: '#MOCK' + String(r).padStart(4, '0'),
      name: 'TopPlayer ' + r,
      rank: r,
      lastBattleTime: new Date(Date.now() - agoSec * 1000),
      deck: pick(MOCK_CARDS, 8).map((name) => ({ name, level: 14, elixir: null })),
      mode: MODES[Math.floor(Math.random() * MODES.length)],
      win: Math.random() < 0.5,
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
