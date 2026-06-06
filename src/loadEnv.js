// Minimal .env loader (no dependency). Imported FIRST in server.js so process.env
// is populated before crClient.js reads CR_API_TOKEN at import time.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  const txt = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const k = m[1];
    const v = m[2].replace(/^["']|["']$/g, '').trim();
    if (process.env[k] === undefined) process.env[k] = v;
  }
} catch { /* no .env file — use real env vars, or fall back to mock mode */ }
