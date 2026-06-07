// ============================ i18n ============================
const I18N = {
  en: {
    label: '中文', htmlLang: 'en',
    tagline: 'top-200 ranked players who just finished a match',
    live: 'live', active: 'active',
    searchPlaceholder: 'Filter by name, clan or tag…',
    matchingOnly: 'Matching only',
    rankLabel: 'Rank', rankAll: 'All ranks',
    monitorLabel: 'Monitor top', monitorSuffix: '', refresh: 'Refresh',
    colPlayer: 'Player', colTrophies: 'Trophies', colStatus: 'Last game', colResult: 'Result',
    sortLabel: 'Sort', sortRecent: 'Most recent', sortRank: 'Highest rank',
    win: 'WIN', loss: 'LOSS', draw: 'DRAW',
    matching: 'just finished', justPlayed: 'played recently',
    disclaimer: 'Shows only games that <b>finished</b> in the last few minutes. The API reports finished battles only — it can\'t tell whether a player has already started their next game (if they have, you can\'t run into them in ranked).',
    ranked: 'Ranked', deck: 'Deck', tower: 'Tower',
    avgElixir: 'avg elixir', cycle: '4-card cycle',
    vs: 'vs', copyDeck: 'Copy deck', copied: 'Copied!', openGame: 'Open in game',
    royaleApi: 'RoyaleAPI', showDeck: 'Show deck',
    window: (w) => w + ' min',
    emptyNoOne: (w) => 'No top-200 player has finished a ranked match in the last ' + w +
      ' minutes yet — this updates the instant one does.',
    emptyFiltered: 'No players match your filters.',
    mockNote: 'Showing MOCK data. Set CR_API_TOKEN in .env for live data — see README.',
    footer: 'Click any row for the deck from their last ranked game. 🔴 = just played, likely in their next game now.',
    legendEvo: 'evolution', legendEvo2: 'hero', legendChamp: 'champion',
    soundOn: 'Snipe alerts ON — ping when a tracked player just played',
    soundOff: 'Snipe alerts OFF',
    justNow: 'just now', secAgo: (s) => s + 's ago',
    minAgo: (m, s) => m + 'm' + (s ? ' ' + s + 's' : '') + ' ago',
    alertBody: (name, rank) => '#' + rank + ' ' + name + ' just played — snipe now',
    alertTitle: '🎯 91Snipe',
  },
  zh: {
    label: 'EN', htmlLang: 'zh-CN',
    tagline: '刚刚打完排位赛的前200名顶尖玩家',
    live: '实时', active: '在线',
    searchPlaceholder: '按昵称、战队或标签筛选…',
    matchingOnly: '仅显示匹配中',
    rankLabel: '排名', rankAll: '全部排名',
    monitorLabel: '监控前', monitorSuffix: '名', refresh: '刷新',
    colPlayer: '玩家', colTrophies: '奖杯', colStatus: '最近对战', colResult: '战绩',
    sortLabel: '排序', sortRecent: '最近对战', sortRank: '最高排名',
    win: '胜', loss: '负', draw: '平',
    matching: '刚刚结束', justPlayed: '最近打过',
    disclaimer: '仅显示最近几分钟内<b>结束</b>的对战。官方接口只提供已结束的战斗——无法得知玩家是否已经开始了下一场（若已开始，你在排位中就遇不到他了）。',
    ranked: '排位赛', deck: '卡组', tower: '塔单位',
    avgElixir: '平均圣水', cycle: '四张循环',
    vs: '对手', copyDeck: '复制卡组', copied: '已复制！', openGame: '在游戏中打开',
    royaleApi: 'RoyaleAPI', showDeck: '查看卡组',
    window: (w) => w + ' 分钟',
    emptyNoOne: (w) => '过去 ' + w + ' 分钟内还没有前200名玩家打完排位赛——一旦有人打完会立即更新。',
    emptyFiltered: '没有符合筛选条件的玩家。',
    mockNote: '当前显示的是模拟数据。在 .env 中设置 CR_API_TOKEN 即可获取实时数据——详见 README。',
    footer: '点击任意一行查看该玩家最近一场排位赛的卡组。🔴 = 刚刚打完，可能正在下一场对战中。',
    legendEvo: '进化', legendEvo2: '英雄', legendChamp: '冠军卡',
    soundOn: '上分提醒已开启——追踪的玩家刚打完时会提示',
    soundOff: '上分提醒已关闭',
    justNow: '刚刚', secAgo: (s) => s + ' 秒前',
    minAgo: (m, s) => m + ' 分' + (s ? ' ' + s + ' 秒' : '') + '前',
    alertBody: (name, rank) => '第 ' + rank + ' 名 ' + name + ' 刚刚打完——快去上分',
    alertTitle: '🎯 91Snipe',
  },
};

// ============================ state ============================
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
const state = {
  window: Number(LS.get('window', 5)) || 5,
  mock: false,
  players: [],
  es: null,
  lang: LS.get('lang', 'zh') === 'en' ? 'en' : 'zh', // default Chinese unless the user chose English
  query: '',
  matchingOnly: LS.get('matchingOnly', '0') === '1',
  topN: Math.min(1000, Math.max(1, Number(LS.get('topN', 200)) || 200)), // monitor top-N ranks (1..1000)
  sort: LS.get('sort', 'recent') === 'rank' ? 'rank' : 'recent',
  sound: LS.get('sound', '0') === '1',
  expanded: new Set(),
  prevMatching: new Set(),
  primed: false,
};
const t = () => I18N[state.lang];
const MATCH_SECS = 120;

// ============================ helpers ============================
function fmtAgo(sec) {
  const L = t();
  if (sec < 5) return L.justNow;
  if (sec < 60) return L.secAgo(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  return L.minAgo(m, s);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function avgElixir(deck) {
  const vals = (deck || []).map((c) => c.elixir).filter((e) => typeof e === 'number');
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}
function cycleCost(deck) {
  const vals = (deck || []).map((c) => c.elixir).filter((e) => typeof e === 'number').sort((a, b) => a - b);
  if (vals.length < 4) return null;
  return vals.slice(0, 4).reduce((a, b) => a + b, 0);
}
function levelClass(lv) {
  if (lv >= 16) return 'lvl-max';
  if (lv >= 14) return 'lvl-high';
  if (lv >= 11) return 'lvl-mid';
  return 'lvl-low';
}
function medalClass(rank) {
  if (rank === 1) return 'medal-1';
  if (rank === 2) return 'medal-2';
  if (rank === 3) return 'medal-3';
  return '';
}

// ============================ rendering ============================
function cardTile(c) {
  const name = escapeHtml(c.name || '');
  const cls = ['card'];
  let badge = '';
  if (c.champion) {
    cls.push('is-champ');
    badge = `<span class="tag-champ" title="${escapeHtml(t().legendChamp)}">♛</span>`;
  } else if (c.evolution) {
    const lvl = c.evolutionLevel || 1;            // 1 = evolution (pink), 2 = hero (gold)
    cls.push('is-evo', 'evo-l' + lvl);
    badge = `<span class="tag-evo" title="${escapeHtml(lvl >= 2 ? t().legendEvo2 : t().legendEvo)}">◆</span>`;
  }
  // if the evolved art 404s on the CDN (e.g. Princess), fall back to the base card art
  const fallback = (c.baseIconUrl && c.baseIconUrl !== c.iconUrl)
    ? ` onerror="this.onerror=null;this.src='${escapeHtml(c.baseIconUrl)}'"` : '';
  const art = c.iconUrl
    ? `<img class="card-art" loading="lazy" src="${c.iconUrl}"${fallback} alt="${name}" />`
    : `<div class="card-fallback">${name}</div>`;
  const lv = c.level != null
    ? `<span class="lvl ${levelClass(c.level)}">${escapeHtml(c.level)}</span>` : '';
  const elix = c.elixir != null ? `<span class="elix">${escapeHtml(c.elixir)}</span>` : '';
  return `<div class="${cls.join(' ')}" title="${name}">${elix}${badge}${art}${lv}</div>`;
}

function deckPanel(p) {
  const L = t();
  const avg = avgElixir(p.deck);
  const cyc = cycleCost(p.deck);
  const cards = (p.deck || []).map(cardTile).join('');
  const tower = p.towerTroop ? `<div class="tower">
      <span class="tower-label">${L.tower}</span>
      <div class="card tower-card" title="${escapeHtml(p.towerTroop.name)}">
        ${p.towerTroop.iconUrl ? `<img class="card-art" loading="lazy" src="${p.towerTroop.iconUrl}" alt="${escapeHtml(p.towerTroop.name)}">`
          : `<div class="card-fallback">${escapeHtml(p.towerTroop.name)}</div>`}
        ${p.towerTroop.level != null ? `<span class="lvl ${levelClass(p.towerTroop.level)}">${escapeHtml(p.towerTroop.level)}</span>` : ''}
      </div>
    </div>` : '';
  const stats = [
    avg ? `<span class="dstat">💧 ${avg} <i>${L.avgElixir}</i></span>` : '',
    cyc ? `<span class="dstat">♻️ ${cyc} <i>${L.cycle}</i></span>` : '',
    p.opponentName ? `<span class="dstat dstat-vs">${L.vs} ${escapeHtml(p.opponentName)}</span>` : '',
  ].join('');
  const copyBtn = p.deckLink
    ? `<button class="act act-copy" data-copy="${escapeHtml(p.deckLink)}">📋 ${L.copyDeck}</button>
       <a class="act" href="${escapeHtml(p.deckLink)}" target="_blank" rel="noopener">▶ ${L.openGame}</a>` : '';
  return `<div class="deckpanel">
      <div class="deckhead">
        <div class="dstats">${stats}</div>
        <div class="dactions">
          ${copyBtn}
          <a class="act act-rapi" href="${p.royaleApiUrl}" target="_blank" rel="noopener">${L.royaleApi} ↗</a>
        </div>
      </div>
      <div class="deckbody">
        <div class="cards">${cards}</div>
        ${tower}
      </div>
    </div>`;
}

function scoreBadge(p) {
  const L = t();
  if (p.crowns == null || p.oppCrowns == null) {
    return p.win === true ? `<span class="res win">${L.win}</span>`
      : p.win === false ? `<span class="res loss">${L.loss}</span>` : '';
  }
  const cls = p.win === true ? 'win' : p.win === false ? 'loss' : 'draw';
  const word = p.win === true ? L.win : p.win === false ? L.loss : L.draw;
  return `<span class="res ${cls}"><span class="crowns">👑 ${p.crowns}–${p.oppCrowns}</span> ${word}</span>`;
}

function rowHtml(p, now) {
  const L = t();
  const tm = new Date(p.lastBattleTime).getTime();
  const sec = Math.max(0, Math.round((now - tm) / 1000));
  const matching = sec < MATCH_SECS;
  const open = state.expanded.has(p.tag);
  return `<div class="row ${matching ? 'matching' : ''} ${open ? 'open' : ''}" data-tag="${escapeHtml(p.tag)}">
    <div class="row-head" data-toggle>
      <div class="rank ${medalClass(p.rank)}">#${p.rank ?? '?'}</div>
      <div class="who">
        <div class="name">${escapeHtml(p.name)}</div>
        ${p.clanName ? `<div class="sub"><span class="clan">${escapeHtml(p.clanName)}</span></div>` : ''}
      </div>
      <div class="c-trophies">${p.trophies != null ? `<span class="elo">🏆 ${escapeHtml(p.trophies)}</span>` : '<span class="muted">—</span>'}</div>
      <div class="c-status">
        <span class="badge ${matching ? 'b-match' : 'b-recent'}">${matching ? '🔴 ' + L.matching : '🟢 ' + L.justPlayed}</span>
        <span class="ago" data-t="${tm}">${escapeHtml(fmtAgo(sec))}</span>
      </div>
      <div class="c-result">${scoreBadge(p)}</div>
      <span class="chev" aria-hidden="true">▾</span>
    </div>
    ${deckPanel(p)}
  </div>`;
}

function visiblePlayers() {
  const q = state.query.trim().toLowerCase();
  let list = state.players.filter((p) => {
    if (state.topN && (p.rank == null || p.rank > state.topN)) return false;
    if (state.matchingOnly && p.secondsAgo >= MATCH_SECS) return false;
    if (!q) return true;
    return (p.name || '').toLowerCase().includes(q)
      || (p.tag || '').toLowerCase().includes(q)
      || (p.clanName || '').toLowerCase().includes(q);
  });
  if (state.sort === 'rank') list = list.slice().sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  else list = list.slice().sort((a, b) => a.secondsAgo - b.secondsAgo);
  return list;
}

function render() {
  const L = t();
  const grid = document.getElementById('grid');
  const list = visiblePlayers();
  document.getElementById('count').textContent = list.length;
  if (!list.length) {
    const msg = state.players.length ? L.emptyFiltered : L.emptyNoOne(state.window);
    grid.innerHTML = `<div class="empty">${escapeHtml(msg)}</div>`;
    return;
  }
  const now = Date.now();
  grid.innerHTML = list.map((p) => rowHtml(p, now)).join('');
}

// keep the "x s ago" counters ticking between server pushes
function tickAgos() {
  const now = Date.now();
  document.querySelectorAll('.ago').forEach((el) => {
    el.textContent = fmtAgo(Math.max(0, Math.round((now - Number(el.dataset.t)) / 1000)));
  });
}

// ============================ snipe alerts ============================
let audioCtx = null;
let lastAlert = 0;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
    o.start(); o.stop(audioCtx.currentTime + 0.26);
  } catch {}
}
function maybeAlert() {
  // players currently "matching" within the active rank filter
  const now = Date.now();
  const cur = new Set();
  let lead = null;
  for (const p of state.players) {
    const sec = Math.max(0, Math.round((now - new Date(p.lastBattleTime).getTime()) / 1000));
    if (sec >= MATCH_SECS) continue;
    if (state.topN && (p.rank == null || p.rank > state.topN)) continue;
    cur.add(p.tag);
    if (!state.prevMatching.has(p.tag) && (!lead || (p.rank ?? 1e9) < (lead.rank ?? 1e9))) lead = p;
  }
  const fresh = [...cur].some((tag) => !state.prevMatching.has(tag));
  // throttle so a busy stream can't fire the alert more than once every few seconds
  if (state.primed && state.sound && fresh && lead && Date.now() - lastAlert > 4000) {
    lastAlert = Date.now();
    beep();
    if ('Notification' in window && Notification.permission === 'granted') {
      const L = t();
      try { new Notification(L.alertTitle, { body: L.alertBody(lead.name, lead.rank), silent: true }); } catch {}
    }
  }
  state.prevMatching = cur;
  state.primed = true;
}

// ============================ static i18n ============================
function applyStaticI18n() {
  const L = t();
  document.documentElement.lang = L.htmlLang;
  document.getElementById('lang').textContent = L.label;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.dataset.i18n; if (typeof L[k] === 'string') el.textContent = L[k];
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const k = el.dataset.i18nHtml; if (typeof L[k] === 'string') el.innerHTML = L[k];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const k = el.dataset.i18nPh; if (typeof L[k] === 'string') el.placeholder = L[k];
  });
  document.querySelectorAll('[data-i18n-opt]').forEach((el) => {
    const k = el.dataset.i18nOpt; if (typeof L[k] === 'string') el.textContent = L[k];
  });
  document.querySelectorAll('[data-window]').forEach((b) => { b.textContent = L.window(Number(b.dataset.window)); });
  const sb = document.getElementById('sound');
  sb.textContent = state.sound ? '🔔' : '🔕';
  sb.setAttribute('aria-pressed', String(state.sound));
  sb.title = state.sound ? L.soundOn : L.soundOff;
  document.getElementById('refresh').title = L.refresh;
}

// ============================ SSE ============================
function connect() {
  if (state.es) state.es.close();
  state.primed = false; state.prevMatching = new Set();
  state.es = new EventSource('/api/stream?window=' + state.window);
  state.es.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      state.players = d.players || [];
      const live = new Set(state.players.map((p) => p.tag));
      for (const tag of state.expanded) if (!live.has(tag)) state.expanded.delete(tag);
      document.getElementById('live').classList.add('on');
      maybeAlert();
      render();
    } catch { /* ignore malformed frame */ }
  };
  state.es.onerror = () => document.getElementById('live').classList.remove('on');
}

// ============================ wiring ============================
function wireUi() {
  document.getElementById('lang').addEventListener('click', () => {
    state.lang = state.lang === 'en' ? 'zh' : 'en';
    LS.set('lang', state.lang);
    applyStaticI18n(); render();
  });

  // refresh button — reconnects the stream (server pushes a fresh frame at once) + spins
  const refresh = document.getElementById('refresh');
  refresh.addEventListener('click', () => {
    refresh.classList.remove('spin'); void refresh.offsetWidth; refresh.classList.add('spin');
    connect();
  });

  const sound = document.getElementById('sound');
  sound.addEventListener('click', async () => {
    state.sound = !state.sound;
    LS.set('sound', state.sound ? '1' : '0');
    if (state.sound) {
      beep(); // also unlocks the audio context on user gesture
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch {}
      }
    }
    applyStaticI18n();
  });

  const search = document.getElementById('search');
  search.addEventListener('input', () => { state.query = search.value; render(); });

  const mo = document.getElementById('matchingOnly');
  mo.checked = state.matchingOnly;
  mo.addEventListener('change', () => { state.matchingOnly = mo.checked; LS.set('matchingOnly', mo.checked ? '1' : '0'); render(); });

  // manual "monitor top N" control (1..200, default 200)
  const topN = document.getElementById('topN');
  topN.value = String(state.topN);
  const applyTopN = () => {
    const v = parseInt(topN.value, 10);
    if (!Number.isFinite(v)) return;                 // ignore an empty field mid-typing
    state.topN = Math.max(1, Math.min(1000, v));
    LS.set('topN', String(state.topN));
    state.prevMatching = new Set();
    render();
  };
  topN.addEventListener('input', applyTopN);
  topN.addEventListener('change', () => { applyTopN(); topN.value = String(state.topN); }); // normalize on blur

  const sort = document.getElementById('sort');
  sort.value = state.sort;
  sort.addEventListener('change', () => { state.sort = sort.value; LS.set('sort', sort.value); render(); });

  document.querySelectorAll('[data-window]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.window) === state.window);
    b.addEventListener('click', () => {
      state.window = Number(b.dataset.window);
      LS.set('window', state.window);
      document.querySelectorAll('[data-window]').forEach((x) => x.classList.toggle('active', x === b));
      connect();
    });
  });

  // delegated clicks: expand/collapse + copy-deck
  document.getElementById('grid').addEventListener('click', (e) => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      e.preventDefault();
      const link = copy.dataset.copy;
      const done = () => { const L = t(); const o = copy.textContent; copy.textContent = '✓ ' + L.copied; copy.classList.add('ok'); setTimeout(() => { copy.textContent = o; copy.classList.remove('ok'); }, 1500); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done).catch(done);
      else done();
      return;
    }
    if (e.target.closest('a')) return; // let real links through
    // only the header toggles — clicks inside the open deck panel shouldn't collapse it
    const head = e.target.closest('.row-head');
    if (!head) return;
    const row = head.closest('.row');
    const tag = row.dataset.tag;
    if (state.expanded.has(tag)) state.expanded.delete(tag); else state.expanded.add(tag);
    row.classList.toggle('open', state.expanded.has(tag));
  });
}

async function init() {
  const meta = await fetch('/api/meta').then((r) => r.json()).catch(() => ({}));
  // server default only wins if the user hasn't picked a window before
  if (LS.get('window', null) === null) state.window = meta.defaultWindow || 5;
  state.mock = !!meta.mock;
  if (state.mock) document.getElementById('mock').hidden = false;
  applyStaticI18n();
  wireUi();
  connect();
  setInterval(tickAgos, 1000);
}
init();
