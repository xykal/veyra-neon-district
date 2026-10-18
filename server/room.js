// The same authoritative world + session protocol on Node TCP and Cloudflare WebSockets.
import { Game } from '../shared/game.js';
import { MSG } from '../shared/constants.js';

export class WorldRoom {
  constructor({ profiles, seed = 20251018, maxPlayers = 32, iceServers = [{ urls:'stun:stun.l.google.com:19302' }], onJoin, onLeave } = {}) {
    this.profiles = profiles;
    this.maxPlayers = Math.max(2, Math.min(64, Number(maxPlayers) || 32));
    this.iceServers = iceServers;
    this.onJoin = onJoin;
    this.onLeave = onLeave;
    this.game = new Game({ seed });
    this.conns = new Map();
    this.ipCounts = new Map();
    this.game.leaderboard = { top:n => profiles.top(n, this.game.players.values()) };
    this.game.io = {
      broadcastRaw:raw => { for (const c of this.conns.values()) c.send(raw, raw.startsWith('{"t":"s",')); },
      sendRaw:(id, raw) => this.conns.get(id)?.send(raw, raw.startsWith('{"t":"s",')),
    };
  }
  broadcast(value) { this.game.io.broadcastRaw(JSON.stringify(value)); }
  roster() { this.broadcast({ t:'vpeers', ids:[...this.game.players.values()].filter(p => p.voiceReady).map(p => p.id) }); }
  canAccept(ip) { return this.conns.size < this.maxPlayers && (this.ipCounts.get(ip) || 0) < 12; }
  accept(conn, ip = '') {
    if (!this.canAccept(ip)) { conn.close(1013); return null; }
    const { game, profiles } = this;
    const id = game.nextPlayerId++;
    this.conns.set(id, conn);
    this.ipCounts.set(ip, (this.ipCounts.get(ip) || 0) + 1);
    let player = null, tokens = 180, lastToken = performance.now(), ended = false;
    const helloTimer = setTimeout(() => conn.close(1008), 10000);
    helloTimer.unref?.();
    conn.onMessage = raw => {
      if (ended) return;
      const now = performance.now();
      tokens = Math.min(180, tokens + (now - lastToken) * .09); lastToken = now;
      if (--tokens < 0) return conn.close(1008);
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
      if (msg.t === MSG.HELLO && !player) {
        let session = profiles.resume(msg.r);
        // Closing the prior session is synchronous in both transports: no stale wallet rollback.
        for (const p of game.players.values()) {
          if (p.profileKey === session.key) { profiles.record(p); this.conns.get(p.id)?.close(4001); }
        }
        if (session.data) session = profiles.resume(session.token);
        const name = String(msg.n || 'Warga').slice(0, 64).replace(/[^\p{L}\p{N}_ .-]/gu, '').trim().slice(0, 16) || 'Warga';
        player = game.addPlayer(name, id);
        profiles.restore(player, session); profiles.record(player);
        clearTimeout(helloTimer);
        this.onJoin?.(player);
        conn.send(JSON.stringify({ t:MSG.WELCOME, id:player.id, name:player.name, seed:game.seed, r:session.token, voice:{ iceServers:this.iceServers, limit:8 } }));
        this.broadcast({ t:MSG.SYSTEM, m:`${player.name} masuk distrik.` });
        game.sendLeaderboard(player); return;
      }
      if (!player) return;
      player.lastSeen = now;
      if (msg.t === MSG.INPUT) player.lastInput = now;
      if (msg.t === 'vsig') {
        const d = msg.d;
        if (!d || typeof d !== 'object') return;
        if (d.k === 'join') {
          if ([...game.players.values()].filter(p => p.voiceReady).length >= 8 && !player.voiceReady) {
            return conn.send(JSON.stringify({ t:'verr', m:'Voice penuh (maksimal 8 mic). Coba sebentar lagi.' }));
          }
          player.voiceReady = true; this.roster(); return;
        }
        if (d.k === 'leave') { player.voiceReady = false; this.roster(); this.broadcast({ t:'vsig', from:id, d:{ k:'talk', on:false } }); return; }
        if (!player.voiceReady) return;
        if (d.k === 'talk') { this.broadcast({ t:'vsig', from:id, d:{ k:'talk', on:!!d.on } }); return; }
        const to = Number(msg.to), target = game.players.get(to);
        if (to === id || !target?.voiceReady || !['offer','answer','ice'].includes(d.k)) return;
        if ((d.k === 'offer' || d.k === 'answer') && (typeof d.sdp !== 'string' || d.sdp.length > 24000)) return;
        if (d.k === 'ice' && (typeof d.c !== 'object' || JSON.stringify(d.c).length > 2048)) return;
        this.conns.get(to)?.send(JSON.stringify({ t:'vsig', from:id, d })); return;
      }
      game.handleMessage(player, raw);
    };
    conn.onClose = () => {
      if (ended) return;
      ended = true; clearTimeout(helloTimer);
      this.conns.delete(id);
      const count = (this.ipCounts.get(ip) || 1) - 1;
      if (count > 0) this.ipCounts.set(ip, count); else this.ipCounts.delete(ip);
      if (player) {
        profiles.record(player); game.removePlayer(id);
        this.broadcast({ t:MSG.SYSTEM, m:`${player.name} keluar distrik.` });
        if (player.voiceReady) this.roster();
      }
      this.onLeave?.(player);
    };
    return id;
  }
  tick(dt, now = performance.now()) {
    for (const p of this.game.players.values()) if (now - (p.lastInput ?? now) > 700) p.input = {};
    this.game.tick(dt);
  }
  save() {
    for (const p of this.game.players.values()) this.profiles.record(p);
    this.profiles.save();
  }
}
