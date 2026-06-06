import './loadEnv.js'; // MUST be first: populate process.env before crClient reads the token
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as store from './store.js';
import { bus } from './store.js';
import { isMock } from './crClient.js';
import { startReal, startMock } from './poller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_WINDOW = Number(process.env.WINDOW_MINUTES || 5);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(res, urlPath) {
  const rel = (urlPath === '/' ? '/index.html' : urlPath).split('?')[0];
  const filePath = path.join(PUBLIC, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function json(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;

  if (p === '/api/meta') {
    return json(res, { mock: isMock, defaultWindow: DEFAULT_WINDOW, players: store.size() });
  }
  if (p === '/api/recent') {
    const w = Number(u.searchParams.get('window') || DEFAULT_WINDOW);
    return json(res, { mock: isMock, window: w, generatedAt: new Date().toISOString(), players: store.recent(w) });
  }
  if (p === '/api/stream') {
    const w = Number(u.searchParams.get('window') || DEFAULT_WINDOW);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const send = () => res.write(`data: ${JSON.stringify({ window: w, generatedAt: new Date().toISOString(), players: store.recent(w) })}\n\n`);
    send();
    const onUpdate = () => send();
    bus.on('update', onUpdate);
    const ka = setInterval(() => res.write(': keepalive\n\n'), 15000);
    req.on('close', () => { bus.off('update', onUpdate); clearInterval(ka); });
    return;
  }
  return serveStatic(res, p);
});

server.listen(PORT, () => {
  console.log(`Clash Royale live tracker → http://localhost:${PORT}  (${isMock ? 'MOCK' : 'REAL'} data)`);
  if (isMock) startMock(); else startReal();
});
