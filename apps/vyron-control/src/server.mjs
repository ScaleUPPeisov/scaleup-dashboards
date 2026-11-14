import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { normalizeChannels } from './core.mjs';
import { JsonStore } from './store.mjs';
import { SyncEngine } from './sync.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.VYRON_CONTROL_TOKEN || '';
if (token.length < 32) {
  console.error('Set VYRON_CONTROL_TOKEN to a random secret of at least 32 characters.');
  process.exit(1);
}
const channelsFile = process.env.VYRON_CHANNELS_FILE || join(root, 'channels.json');
let channels = [];
try {
  channels = normalizeChannels(JSON.parse(await readFile(channelsFile, 'utf8')));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  console.warn('No channel registry yet: create channels.json or set VYRON_CHANNELS_FILE.');
}
const store = new JsonStore(process.env.VYRON_CONTROL_DB || join(root, 'data', 'state.json'));
await store.load();
const budget = Number(process.env.VYRON_CONTROL_DAILY_BUDGET || 200);
if (!Number.isSafeInteger(budget) || budget < 1 || budget > 10000) throw new Error('Invalid local quota budget');
const engine = new SyncEngine({
  store, channels, apiKey: process.env.VYRON_YOUTUBE_API_KEY || '', quotaBudget: budget
});

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/service-worker.js': ['service-worker.js', 'text/javascript; charset=utf-8']
};
function authed(header) {
  const claimed = typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice(7) : '';
  const a = Buffer.from(claimed), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function originAllowed(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/health' && req.method === 'GET') {
      send(res, 200, { ok: true });
      return;
    }
    if (pathname.startsWith('/api/')) {
      if (!authed(req.headers.authorization)) return send(res, 401, { error: 'Unauthorized' });
      if (!originAllowed(req)) return send(res, 403, { error: 'Cross-origin request blocked' });
      if (pathname === '/api/status' && req.method === 'GET')
        return send(res, 200, engine.publicStatus());
      if (pathname === '/api/refresh' && req.method === 'POST') {
        const result = await engine.refresh('manual');
        return send(res, 200, result);
      }
      return send(res, 404, { error: 'Not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return send(res, 405, { error: 'Method not allowed' });
    if (!files[pathname]) return send(res, 404, { error: 'Not found' });
    const [name, mime] = files[pathname];
    const bytes = await readFile(join(root, 'public', name));
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-store',
      'Content-Length': bytes.length
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status : 500;
    send(res, status, { error: status === 500 ? 'Internal server error' : error.message });
    if (status === 500) console.error('Request failed:', error.message);
  }
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => console.log(`VYRON CONTROL available at http://${host}:${port}`));
const timer = setInterval(() => {
  engine.tick().catch(error => console.error('Scheduled sync:', error.message));
}, 30_000);
timer.unref();
engine.tick().catch(error => console.error('Initial schedule tick:', error.message));
