// In-memory store of the players we track, plus a tiny event bus so the SSE
// endpoint can push the moment anything changes.
import { EventEmitter } from 'events';

export const bus = new EventEmitter();
bus.setMaxListeners(0);

const players = new Map(); // tag -> { tag, name, rank, lastBattleTime, deck, mode, win, ... }

export function upsert(entry) {
  const prev = players.get(entry.tag) || {};
  players.set(entry.tag, { ...prev, ...entry });
}

export function size() { return players.size; }
export function clear() { players.clear(); }

// Players whose most recent battle ended within `windowMin` minutes, freshest first.
export function recent(windowMin = 5) {
  const now = Date.now();
  const cutoff = now - windowMin * 60000;
  const out = [];
  for (const p of players.values()) {
    if (!p.lastBattleTime) continue;
    const t = p.lastBattleTime instanceof Date ? p.lastBattleTime.getTime() : new Date(p.lastBattleTime).getTime();
    if (isNaN(t) || t < cutoff) continue;
    const secondsAgo = Math.max(0, Math.round((now - t) / 1000));
    out.push({
      tag: p.tag,
      cleanTag: String(p.tag).replace('#', ''),
      name: p.name,
      rank: p.rank ?? null,
      deck: p.deck || [],
      mode: p.mode || null,
      win: p.win ?? null,
      lastBattleTime: new Date(t).toISOString(),
      secondsAgo,
      // Just finished and hasn't surfaced a newer battle yet -> very likely
      // queuing or already in their next game. Best inference the API allows.
      status: secondsAgo < 120 ? 'matching' : 'recent',
      royaleApiUrl: `https://royaleapi.com/player/${String(p.tag).replace('#', '')}`,
    });
  }
  out.sort((a, b) => a.secondsAgo - b.secondsAgo);
  return out;
}

export function notifyUpdated() { bus.emit('update'); }
