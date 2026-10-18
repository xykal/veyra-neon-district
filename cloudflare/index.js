import { DurableObject } from 'cloudflare:workers';
import { WorldRoom } from '../server/room.js';
import { TICK_HZ } from '../shared/constants.js';
import { SqlProfiles } from './profiles.js';

const MAX_MESSAGE = 64 * 1024;
const JSON_HEADERS = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin' };
const json = (value, status = 200, head = false) => new Response(head ? null : JSON.stringify(value), { status, headers:JSON_HEADERS });
const isUpgrade = request => request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

class WorkerSocket {
  constructor(ws, onFinish) { this.ws = ws; this.onFinish = onFinish; this.dead = false; }
  send(raw, transient = false) {
    if (this.dead || this.ws.readyState !== 1) return false;
    const buffered = this.ws.bufferedAmount || 0;
    if (buffered > 2 * 1024 * 1024) { this.close(1013); return false; }
    if (transient && buffered > 128 * 1024) return false;
    try { this.ws.send(raw); return true; } catch { this.close(1011); return false; }
  }
  finish() {
    if (this.dead) return;
    this.dead = true;
    try { this.onClose?.(); } finally { this.onFinish(); }
  }
  close(code = 1000) {
    try { this.ws.close(code); } catch { /* already closing */ }
    this.finish();
  }
}

export class City extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.profiles = new SqlProfiles(ctx.storage);
    this.room = null;
    this.sockets = new Map();
    this.loop = null;
    this.previous = 0;
    this.lastSave = 0;
    // A deploy/crash does not silently leave old sockets in a fresh, empty world.
    // They reconnect and restore their saved identity; live vehicle/position state is transient.
    for (const ws of ctx.getWebSockets()) {
      try { ws.close(1012, 'District restarted; reconnect'); } catch { /* stale socket */ }
    }
  }
  getRoom() {
    if (this.room) return this.room;
    let iceServers = [{ urls:'stun:stun.l.google.com:19302' }];
    if (this.env.ICE_SERVERS) {
      try { const value = JSON.parse(this.env.ICE_SERVERS); if (Array.isArray(value)) iceServers = value; }
      catch { console.warn('Invalid ICE_SERVERS; using default STUN.'); }
    }
    this.room = new WorldRoom({
      profiles:this.profiles,
      seed:Number(this.env.SEED) || 20251018,
      maxPlayers:Number(this.env.MAX_PLAYERS) || 16,
      iceServers,
      onJoin:() => this.profiles.save(),
      onLeave:() => {
        this.profiles.save();
        if (!this.room.conns.size) this.stop();
      },
    });
    return this.room;
  }
  start() {
    if (this.loop) return;
    this.previous = this.lastSave = performance.now();
    this.loop = setInterval(() => {
      try {
        const now = performance.now();
        const dt = Math.min(.1, Math.max(0, (now - this.previous) / 1000));
        this.previous = now;
        this.room.tick(dt, now);
        if (now - this.lastSave >= 30000) { this.room.save(); this.lastSave = now; }
      } catch (e) { this.fail(e); }
    }, 1000 / TICK_HZ);
  }
  stop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }
  fail(error) {
    this.stop();
    console.error('City runtime/storage failed:', error.message);
    for (const c of [...this.sockets.values()]) {
      try { c.close(1011); } catch { /* fail closed; do not keep awarding unsaved progress */ }
    }
  }
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/healthz') return json({ ok:true, game:'veyra-neon-district', runtime:'cloudflare-durable-objects', build:this.env.BUILD_SHA || 'local', players:this.room?.game.players.size || 0, capacity:Number(this.env.MAX_PLAYERS) || 16, simulation:this.loop ? 'active' : 'idle' }, 200, request.method === 'HEAD');
    if (path === '/api/leaderboard') return json({ rows:this.profiles.top(25, this.room?.game.players.values() || []) }, 200, request.method === 'HEAD');
    if (path !== '/' || !isUpgrade(request)) return new Response('Not found', { status:404 });
    const room = this.getRoom();
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    if (!room.canAccept(ip)) return json({ error:'District is full; try again shortly.' }, 503);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const conn = new WorkerSocket(server, () => this.sockets.delete(server));
    this.sockets.set(server, conn);
    room.accept(conn, ip);
    this.start();
    return new Response(null, { status:101, webSocket:client });
  }
  webSocketMessage(ws, data) {
    const conn = this.sockets.get(ws);
    if (!conn || conn.dead) { try { ws.close(1012); } catch { /* stale */ } return; }
    if (typeof data !== 'string') return conn.close(1003);
    if (data.length > MAX_MESSAGE || new TextEncoder().encode(data).byteLength > MAX_MESSAGE) return conn.close(1009);
    try { conn.onMessage?.(data); } catch (e) { this.fail(e); }
  }
  webSocketClose(ws, code, reason) {
    try {
      // Explicit reply is also needed by some local/proxy runtimes; idempotent on newer runtimes.
      const valid = code >= 1000 && code < 5000 && ![1004,1005,1006,1015].includes(code);
      ws.close(valid ? code : 1000, reason || '');
      this.sockets.get(ws)?.finish();
    } catch (e) { this.fail(e); }
  }
  webSocketError(ws) { try { this.sockets.get(ws)?.close(1011); } catch (e) { this.fail(e); } }
}

export default {
  async fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status:405, headers:{ Allow:'GET, HEAD' } });
    const url = new URL(request.url);
    if (isUpgrade(request)) {
      if (url.pathname !== '/') return new Response('Not found', { status:404 });
      const origin = request.headers.get('Origin');
      const configured = (env.PUBLIC_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
      if (origin && (configured.length ? !configured.includes(origin) : origin !== url.origin)) return new Response('Forbidden origin', { status:403 });
      return env.CITY.getByName('neon-district-v1').fetch(request);
    }
    if (url.pathname === '/healthz' || url.pathname === '/api/leaderboard') return env.CITY.getByName('neon-district-v1').fetch(request);
    return env.ASSETS.fetch(request);
  },
};
