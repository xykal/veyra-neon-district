// Veyra: Neon District — one authoritative world per Node process.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { acceptWebSocket } from './wsserver.js';
import { Profiles } from './profiles.js';
import { Game } from '../shared/game.js';
import { MSG, TICK_HZ } from '../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon', '.glb':'model/gltf-binary' };

export function createApp(options = {}) {
  const seed = Number(options.seed ?? process.env.SEED) || 20251018;
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(ROOT, 'data');
  const profiles = new Profiles(path.join(dataDir, 'profiles.json'));
  const game = new Game({ seed });
  const conns = new Map();
  const ipCounts = new Map();
  const staticCache = new Map();
  const maxPlayers = Math.max(2, Math.min(64, Number(process.env.MAX_PLAYERS) || 64));
  const publicOrigins = new Set((process.env.PUBLIC_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean));
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.ICE_SERVERS) {
    try { const conf = JSON.parse(process.env.ICE_SERVERS); if (Array.isArray(conf)) iceServers = conf; }
    catch { console.warn('ICE_SERVERS tidak valid, memakai STUN default.'); }
  }
  game.leaderboard = { top: n => profiles.top(n, game.players.values()) };
  const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const httpServer = http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    // No X-Frame-Options: Arena live preview is intentionally embedded.
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow:'GET, HEAD' }); return res.end(); }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch { res.writeHead(400); return res.end(); }
    if (pathname === '/healthz') return json(res, 200, { ok: true, game: 'veyra-neon-district', players: game.players.size, uptime: Math.floor(process.uptime()) });
    if (pathname === '/api/leaderboard') return json(res, 200, { rows: profiles.top(25, game.players.values()) });
    if (pathname.includes('\0') || pathname.split('/').some(s => s.startsWith('.'))) { res.writeHead(404); return res.end('Not found'); }
    const base = pathname.startsWith('/shared/') ? ROOT : path.join(ROOT, 'public');
    const rel = pathname === '/' ? '/index.html' : pathname.endsWith('/') ? pathname + 'index.html' : pathname;
    const file = path.resolve(base, '.' + rel);
    if (!file.startsWith(base + path.sep) || (base === ROOT && !file.startsWith(path.join(ROOT, 'shared') + path.sep))) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
      let entry = staticCache.get(file);
      if (!entry || entry.mtime !== st.mtimeMs) {
        try {
          const raw = fs.readFileSync(file);
          const zipped = raw.length > 1024 ? gzipSync(raw) : null;
          entry = { raw, zip: zipped && zipped.length < raw.length * .95 ? zipped : null, mtime: st.mtimeMs, etag: '"' + createHash('sha256').update(raw).digest('hex').slice(0, 20) + '"' };
          staticCache.set(file, entry);
        } catch { res.writeHead(404); return res.end(); }
      }
      const ext = path.extname(file);
      const isHTML = ext === '.html';
      const headers = { 'Content-Type':MIME[ext] || 'application/octet-stream', 'Cache-Control': isHTML ? 'no-cache' : 'public, max-age=3600, must-revalidate', ETag:entry.etag, Vary:'Accept-Encoding' };
      if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304, headers); return res.end(); }
      const zipped = entry.zip && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      const body = zipped ? entry.zip : entry.raw;
      if (zipped) headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : body);
    });
  });
  httpServer.requestTimeout = 10000; httpServer.headersTimeout = 10000;
  httpServer.keepAliveTimeout = 5000; httpServer.maxHeadersCount = 64;
  const broadcastRaw = raw => { for (const c of conns.values()) c.send(raw, raw.startsWith('{"t":"s",')); };
  const sendRaw = (id, raw) => conns.get(id)?.send(raw, raw.startsWith('{"t":"s",'));
  const broadcast = obj => broadcastRaw(JSON.stringify(obj));
  game.io = { broadcastRaw, sendRaw };
  const roster = () => broadcast({ t:'vpeers', ids:[...game.players.values()].filter(p => p.voiceReady).map(p => p.id) });

  httpServer.on('upgrade', (req, socket, head) => {
    let validOrigin = true;
    if (req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin);
        const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
        validOrigin = publicOrigins.size ? publicOrigins.has(origin.origin) : ['http:', 'https:'].includes(origin.protocol) && origin.host === host;
      } catch { validOrigin = false; }
    }
    const ip = socket.remoteAddress;
    if (!validOrigin || req.url !== '/' || conns.size >= maxPlayers || (ipCounts.get(ip) || 0) >= 12) {
      socket.end('HTTP/1.1 ' + (!validOrigin ? '403 Forbidden' : '503 Service Unavailable') + '\r\nConnection: close\r\n\r\n'); return;
    }
    const conn = acceptWebSocket(req, socket, head);
    if (!conn) return;
    const id = game.nextPlayerId++;
    conns.set(id, conn); ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
    let player = null, tokens = 180, lastToken = performance.now(), helloTimer;
    helloTimer = setTimeout(() => conn.close(1008), 10000); helloTimer.unref();
    conn.onMessage = raw => {
      const now = performance.now(); tokens = Math.min(180, tokens + (now - lastToken) * .09); lastToken = now;
      if (--tokens < 0) return conn.close(1008);
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
      if (msg.t === MSG.HELLO && !player) {
        let session = profiles.resume(msg.r);
        // One active connection per saved profile, avoiding wallet rollback/duplication.
        for (const p of game.players.values()) {
          if (p.profileKey === session.key) { profiles.record(p); conns.get(p.id)?.close(4001); }
        }
        if (session.data) session = profiles.resume(session.token);
        const name = String(msg.n || 'Warga').slice(0, 64).replace(/[^\p{L}\p{N}_ .-]/gu, '').trim().slice(0, 16) || 'Warga';
        player = game.addPlayer(name, id); profiles.restore(player, session); profiles.record(player);
        clearTimeout(helloTimer);
        conn.send(JSON.stringify({ t:MSG.WELCOME, id:player.id, name:player.name, seed:game.seed, r:session.token, voice:{ iceServers, limit:8 } }));
        broadcast({ t:MSG.SYSTEM, m:`${player.name} masuk distrik.` });
        game.sendLeaderboard(player); return;
      }
      if (!player) return;
      player.lastSeen = performance.now();
      if (msg.t === MSG.INPUT) player.lastInput = performance.now();
      if (msg.t === 'vsig') {
        const d = msg.d;
        if (!d || typeof d !== 'object') return;
        if (d.k === 'join') {
          if ([...game.players.values()].filter(p => p.voiceReady).length >= 8 && !player.voiceReady) {
            return conn.send(JSON.stringify({ t:'verr', m:'Voice penuh (maksimal 8 mic). Coba sebentar lagi.' }));
          }
          player.voiceReady = true; roster(); return;
        }
        if (d.k === 'leave') { player.voiceReady = false; roster(); broadcast({ t:'vsig', from:id, d:{ k:'talk', on:false } }); return; }
        if (!player.voiceReady) return;
        if (d.k === 'talk') { broadcast({ t:'vsig', from:id, d:{ k:'talk', on:!!d.on } }); return; }
        const to = Number(msg.to), target = game.players.get(to);
        if (to === id || !target?.voiceReady || !['offer','answer','ice'].includes(d.k)) return;
        if ((d.k === 'offer' || d.k === 'answer') && (typeof d.sdp !== 'string' || d.sdp.length > 24000)) return;
        if (d.k === 'ice' && (typeof d.c !== 'object' || JSON.stringify(d.c).length > 2048)) return;
        conns.get(to)?.send(JSON.stringify({ t:'vsig', from:id, d })); return;
      }
      game.handleMessage(player, raw);
    };
    conn.onClose = () => {
      clearTimeout(helloTimer);
      conns.delete(id); ipCounts.set(ip, Math.max(0, (ipCounts.get(ip) || 1) - 1));
      if (ipCounts.get(ip) === 0) ipCounts.delete(ip);
      if (player) {
        profiles.record(player); game.removePlayer(id);
        broadcast({ t:MSG.SYSTEM, m:`${player.name} keluar distrik.` });
        if (player.voiceReady) roster();
      }
    };
  });
  let previous = performance.now(), closed = false;
  const loop = setInterval(() => {
    const now = performance.now(), dt = Math.min(.1, (now - previous) / 1000); previous = now;
    for (const p of game.players.values()) {
      if (now - (p.lastInput ?? now) > 700) p.input = {};
    }
    game.tick(dt);
  }, 1000 / TICK_HZ);
  const save = () => { for (const p of game.players.values()) profiles.record(p); try { profiles.save(); } catch (e) { console.error('Gagal menyimpan progres:', e.message); } };
  const autosave = setInterval(save, 10000);
  const heartbeat = setInterval(() => {
    for (const c of conns.values()) { if (Date.now() - c.lastPong > 65000) c.close(1001); else c.ping(); }
  }, 25000);
  async function close() {
    if (closed) return;
    closed = true; clearInterval(loop); clearInterval(autosave); clearInterval(heartbeat);
    for (const c of conns.values()) c.close(1001);
    save();
    await new Promise(resolve => httpServer.close(resolve));
  }
  return { server:httpServer, game, profiles, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.server.on('error', e => { console.error('Server gagal:', e.message); process.exit(1); });
  app.server.listen(port, '0.0.0.0', () => console.log(`Veyra: Neon District — http://0.0.0.0:${port}`));
  const shutdown = () => { app.close().then(() => process.exit(0)); setTimeout(() => process.exit(1), 8000).unref(); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
