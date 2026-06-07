// ============================================================================
// In-browser demo data engine.
//
// The live app has a Node backend (src/server.js) that polls the Supercell API
// and pushes updates over SSE. A static host like GitHub Pages can't run that
// backend — and a browser can never call the Supercell API directly (it needs a
// secret token + an IP-whitelisted server). So when no backend is reachable, the
// frontend falls back to THIS engine, which mirrors src/poller.js (mock mode) +
// src/store.js (`recent`) to produce a live, self-contained demo on simulated
// data. When served by the Node server, this file is loaded but unused.
// ============================================================================
(function () {
  // name, elixir, rarity, canEvolve — the same set the server's mock mode uses.
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

  const SEED = 500;      // simulated leaderboard size (ranks 1..SEED) — makes "monitor top N" meaningful
  const TICK_MS = 2500;  // how often a fresh batch of "finished matches" streams in
  const pad = (r) => '#DEMO' + String(r).padStart(4, '0');

  function pick(arr, n) {
    const c = [...arr], out = [];
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
        level: 14 + Math.floor(Math.random() * 3), // 14..16 (already display level)
        maxLevel: 16, evolution, evolutionLevel, champion: false,
        iconUrl: null, // no art without a token -> styled tile
      };
    });
    if (withChamp) {
      const [name, elixir] = MOCK_CHAMPIONS[Math.floor(Math.random() * MOCK_CHAMPIONS.length)];
      cards.unshift({ name, elixir, rarity: 'champion', level: 16, maxLevel: 16, evolution: false, evolutionLevel: 0, champion: true, iconUrl: null });
    }
    return cards;
  }

  // ---- store (mirrors src/store.js) ----
  const players = new Map(); // tag -> entry; persists across window switches so the board doesn't reset
  let seeded = false;
  function seed() {
    if (seeded) return;
    seeded = true;
    for (let r = 1; r <= SEED; r++) {
      players.set(pad(r), { tag: pad(r), name: 'TopPlayer ' + r, rank: r, trophies: Math.max(20, 9000 - r * 8), clanName: 'Demo Clan ' + (1 + (r % 14)) });
    }
  }
  function tick() {
    const n = 8 + Math.floor(Math.random() * 12);
    for (let i = 0; i < n; i++) {
      const r = 1 + Math.floor(Math.random() * SEED);
      const tag = pad(r);
      const prev = players.get(tag) || { tag, name: 'TopPlayer ' + r, rank: r };
      const agoSec = Math.floor(Math.pow(Math.random(), 2) * 600); // bias toward "just now"
      const my = Math.floor(Math.random() * 4);
      const op = Math.random() < 0.5 ? Math.floor(Math.random() * (my || 1)) : my + 1 + Math.floor(Math.random() * 2);
      const oppCrowns = Math.min(3, op);
      players.set(tag, {
        ...prev, tag, rank: r,
        name: prev.name || ('TopPlayer ' + r),
        trophies: prev.trophies ?? Math.max(20, 9000 - r * 8),
        clanName: prev.clanName ?? ('Demo Clan ' + (1 + (r % 14))),
        lastBattleTime: new Date(Date.now() - agoSec * 1000),
        deck: mockDeck(),
        towerTroop: { name: MOCK_TOWERS[Math.floor(Math.random() * MOCK_TOWERS.length)], level: 16, iconUrl: null },
        deckLink: null, mode: 'Ranked',
        crowns: my, oppCrowns,
        win: my > oppCrowns ? true : my < oppCrowns ? false : null,
        opponentName: 'Rival ' + (1 + Math.floor(Math.random() * 999)),
      });
    }
  }
  // Players whose most recent battle ended within `windowMin` minutes, freshest first.
  // Mirrors store.recent so the demo emits exactly the shape the UI expects.
  function recent(windowMin) {
    const now = Date.now();
    const cutoff = now - windowMin * 60000;
    const out = [];
    for (const p of players.values()) {
      if (!p.lastBattleTime) continue;
      const t = p.lastBattleTime instanceof Date ? p.lastBattleTime.getTime() : new Date(p.lastBattleTime).getTime();
      if (isNaN(t) || t < cutoff) continue;
      const secondsAgo = Math.max(0, Math.round((now - t) / 1000));
      const clean = String(p.tag).replace('#', '');
      out.push({
        tag: p.tag, cleanTag: clean, name: p.name,
        rank: p.rank ?? null, trophies: p.trophies ?? null, expLevel: p.expLevel ?? null, clanName: p.clanName ?? null,
        deck: p.deck || [], towerTroop: p.towerTroop ?? null, deckLink: p.deckLink ?? null, mode: p.mode || null,
        crowns: p.crowns ?? null, oppCrowns: p.oppCrowns ?? null, win: p.win ?? null,
        opponentName: p.opponentName ?? null, opponentTag: p.opponentTag ?? null,
        lastBattleTime: new Date(t).toISOString(), secondsAgo,
        status: secondsAgo < 120 ? 'matching' : 'recent',
        royaleApiUrl: `https://royaleapi.com/player/${clean}`,
      });
    }
    out.sort((a, b) => a.secondsAgo - b.secondsAgo);
    return out;
  }

  // ---- controller: a tiny EventSource-like handle the app drives ----
  let timer = null, win = 5, cb = null;
  const emit = () => { if (cb) cb(recent(win)); };
  function start(opts) {
    win = opts.window || 5;
    cb = opts.onData;
    seed();
    // prime a populated first screen if this is a cold start
    if (![...players.values()].some((p) => p.lastBattleTime)) for (let i = 0; i < 6; i++) tick();
    if (timer) clearInterval(timer);
    emit();
    timer = setInterval(() => { tick(); emit(); }, TICK_MS);
    return {
      setWindow(w) { win = w; emit(); },
      refresh() { tick(); emit(); },
      close() { if (timer) clearInterval(timer); timer = null; cb = null; },
    };
  }

  window.SnipeDemo = { start };
})();
