import test from 'node:test';
import assert from 'node:assert';
import * as store from '../src/store.js';
import { parseBattleTime } from '../src/crClient.js';

test('parseBattleTime parses Supercell timestamp format', () => {
  const d = parseBattleTime('20240115T143000.000Z');
  assert.equal(d.toISOString(), '2024-01-15T14:30:00.000Z');
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
