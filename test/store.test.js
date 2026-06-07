import test from 'node:test';
import assert from 'node:assert';
import * as store from '../src/store.js';
import { parseBattleTime, isRankedBattle, apiGet } from '../src/crClient.js';

test('parseBattleTime parses Supercell timestamp format', () => {
  const d = parseBattleTime('20240115T143000.000Z');
  assert.equal(d.toISOString(), '2024-01-15T14:30:00.000Z');
});

test('isRankedBattle only accepts Path of Legends (ranked 1v1)', () => {
  assert.equal(isRankedBattle({ type: 'pathOfLegend' }), true);
  for (const type of ['PvP', 'trail', 'friendly', 'boatBattle', 'riverRaceDuel', 'challenge']) {
    assert.equal(isRankedBattle({ type }), false, `${type} should not count as ranked`);
  }
  assert.equal(isRankedBattle(null), false);
});

test('recent() passes through deck, tower troop, crowns, opponent and deck link', () => {
  store.clear();
  store.upsert({
    tag: '#Z', name: 'Z', rank: 1, trophies: 2200, clanName: 'Clan',
    lastBattleTime: new Date(Date.now() - 30 * 1000),
    deck: [{ id: 26000014, name: 'Musketeer', level: 16, elixir: 4, evolution: true, champion: false }],
    towerTroop: { name: 'Tower Princess', level: 16, iconUrl: null },
    deckLink: 'https://link.clashroyale.com/deck/en?deck=26000014',
    crowns: 2, oppCrowns: 1, win: true, opponentName: 'Rival', opponentTag: '#R',
  });
  const z = store.recent(5).find((p) => p.tag === '#Z');
  assert.equal(z.deck[0].level, 16, 'normalized level is preserved');
  assert.equal(z.deck[0].evolution, true);
  assert.equal(z.towerTroop.name, 'Tower Princess');
  assert.equal(z.crowns, 2);
  assert.equal(z.oppCrowns, 1);
  assert.equal(z.win, true);
  assert.equal(z.opponentName, 'Rival');
  assert.equal(z.trophies, 2200);
  assert.equal(z.clanName, 'Clan');
  assert.ok(z.deckLink.includes('26000014'), 'deck link passed through');
});

test('recent() filters by window and sorts freshest-first', () => {
  store.clear();
  store.upsert({ tag: '#A', name: 'A', rank: 1, lastBattleTime: new Date(Date.now() - 60 * 1000), deck: [] });
  store.upsert({ tag: '#B', name: 'B', rank: 2, lastBattleTime: new Date(Date.now() - 4 * 60 * 1000), deck: [] });
  store.upsert({ tag: '#C', name: 'C', rank: 3, lastBattleTime: new Date(Date.now() - 20 * 60 * 1000), deck: [] });
  const r = store.recent(5);
  const tags = r.map((p) => p.tag);
  assert.ok(tags.includes('#A') && tags.includes('#B'), 'recent players within window are included');
  assert.ok(!tags.includes('#C'), 'players outside the window are excluded');
  assert.equal(r[0].tag, '#A', 'most recent is first');
});

test('recent() flags very-recent players as "matching" and builds RoyaleAPI url', () => {
  store.clear();
  store.upsert({ tag: '#D', name: 'D', rank: 4, lastBattleTime: new Date(Date.now() - 30 * 1000), deck: [] });
  const d = store.recent(5).find((p) => p.tag === '#D');
  assert.equal(d.status, 'matching');
  assert.equal(d.cleanTag, 'D');
  assert.equal(d.royaleApiUrl, 'https://royaleapi.com/player/D');
});

test('recent() ignores players with no recorded battle', () => {
  store.clear();
  store.upsert({ tag: '#E', name: 'E', rank: 5 }); // never battled
  assert.equal(store.recent(5).length, 0);
});

// A ranked match has two participants; if both are monitored, BOTH must surface as
// recently-active, each pointing at the other. This is the property that breaks when
// the poller drops throttled fetches — so we pin it down with a test.
test('recent() surfaces BOTH sides of a shared match (pairing symmetry)', () => {
  store.clear();
  const t = new Date(Date.now() - 60 * 1000);
  store.upsert({ tag: '#A', name: 'A', rank: 10, lastBattleTime: t, deck: [], opponentTag: '#B', opponentName: 'B', crowns: 1, oppCrowns: 0, win: true });
  store.upsert({ tag: '#B', name: 'B', rank: 20, lastBattleTime: t, deck: [], opponentTag: '#A', opponentName: 'A', crowns: 0, oppCrowns: 1, win: false });
  const r = store.recent(5);
  const a = r.find((p) => p.tag === '#A');
  const b = r.find((p) => p.tag === '#B');
  assert.ok(a && b, 'both participants of the match appear');
  assert.equal(a.opponentTag, '#B');
  assert.equal(b.opponentTag, '#A');
  assert.equal(a.lastBattleTime, b.lastBattleTime, 'identical battle time on both sides');
  assert.equal(a.win, true);
  assert.equal(b.win, false);
});

const fakeRes = (status, body) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: () => null },
  text: async () => 'err', json: async () => body,
});

test('apiGet retries past 429 throttling and still returns data (no silent loss)', async () => {
  process.env.CR_RETRY_BASE_MS = '1';
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return calls < 3 ? fakeRes(429) : fakeRes(200, { items: [1, 2] }); };
  try {
    assert.deepEqual(await apiGet('/x'), { items: [1, 2] });
    assert.equal(calls, 3, 'retried through two 429s, then succeeded');
  } finally { globalThis.fetch = orig; }
});

test('apiGet gives up after CR_MAX_RETRIES and throws with status (so the poller can count it)', async () => {
  process.env.CR_RETRY_BASE_MS = '1';
  process.env.CR_MAX_RETRIES = '2';
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return fakeRes(429); };
  try {
    await assert.rejects(() => apiGet('/x'), (e) => e.status === 429);
    assert.equal(calls, 3, '1 initial attempt + 2 retries');
  } finally { globalThis.fetch = orig; delete process.env.CR_MAX_RETRIES; }
});
