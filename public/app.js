const state = { window: 5, mock: false, players: [], es: null };

function fmtAgo(sec) {
  if (sec < 5) return 'just now';
  if (sec < 60) return sec + 's ago';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + 'm' + (s ? ' ' + s + 's' : '') + ' ago';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function render() {
  const grid = document.getElementById('grid');
  document.getElementById('count').textContent = state.players.length;
  if (!state.players.length) {
    grid.innerHTML = '<div class="empty">No top-200 player has finished a match in the last ' +
      state.window + ' minutes yet — this updates the instant one does.</div>';
    return;
  }
  const now = Date.now();
  grid.innerHTML = state.players.map((p) => {
    const t = new Date(p.lastBattleTime).getTime();
    const sec = Math.max(0, Math.round((now - t) / 1000));
    const matching = sec < 120;
    const deck = (p.deck || []).map((c) => `<span class="card" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>`).join('');
    const result = p.win === true ? '<span class="win">WIN</span>' : p.win === false ? '<span class="loss">LOSS</span>' : '';
    return `<a class="row ${matching ? 'matching' : ''}" href="${p.royaleApiUrl}" target="_blank" rel="noopener">
      <div class="rank">#${p.rank ?? '?'}</div>
      <div class="who">
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="meta">
          <span class="badge ${matching ? 'b-match' : 'b-recent'}">${matching ? '🔴 likely matching / in game' : '🟢 just played'}</span>
          <span class="ago" data-t="${t}">${fmtAgo(sec)}</span>
          ${p.mode ? `<span class="mode">${escapeHtml(p.mode)}</span>` : ''}
          ${result}
        </div>
      </div>
      <div class="deck">${deck}</div>
      <div class="go">RoyaleAPI ↗</div>
    </a>`;
  }).join('');
}

// keep the "x s ago" counters ticking between server pushes
function tickAgos() {
  const now = Date.now();
  document.querySelectorAll('.ago').forEach((el) => {
    el.textContent = fmtAgo(Math.max(0, Math.round((now - Number(el.dataset.t)) / 1000)));
  });
}

function connect() {
  if (state.es) state.es.close();
  state.es = new EventSource('/api/stream?window=' + state.window);
  state.es.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      state.players = d.players || [];
      document.getElementById('live').classList.add('on');
      render();
    } catch { /* ignore malformed frame */ }
  };
  state.es.onerror = () => document.getElementById('live').classList.remove('on');
}

async function init() {
  const meta = await fetch('/api/meta').then((r) => r.json()).catch(() => ({}));
  state.window = meta.defaultWindow || 5;
  state.mock = !!meta.mock;
  if (state.mock) document.getElementById('mock').hidden = false;
  document.querySelectorAll('[data-window]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.window) === state.window);
    b.addEventListener('click', () => {
      state.window = Number(b.dataset.window);
      document.querySelectorAll('[data-window]').forEach((x) => x.classList.toggle('active', x === b));
      connect();
    });
  });
  connect();
  setInterval(tickAgos, 1000);
}
init();
