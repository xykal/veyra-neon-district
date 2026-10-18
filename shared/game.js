// Authoritative game world. Server adalah sumber kebenaran semua state.

import { buildMap, randomRoadPoint, mulberry32, isWater, nearbyBlockers } from './map.js';
import {
  stepPlayer, stepCar, resolveCarCollisions, segmentHitsRect,
  clamp, resolveCircleRect,
} from './physics.js';
import { MSG, CAR_TYPES, CAR_LIST, WEAPON, PLAYER_RADIUS, TICK, SNAPSHOT_HZ, RESPAWN_TIME, PLAYER_MAX_HEALTH, WANTED_MAX, WANTED_DECAY_MS, WANTED_STEP_MS, POLICE_RADIUS, BUST_DISTANCE, BUST_RESPAWN } from './constants.js';

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e91e63', '#ff6f00', '#8bc34a', '#00bcd4'];
const PED_COLORS = ['#95a5a6', '#7f8c8d', '#d35400', '#c0392b', '#16a085', '#2980b9', '#8e44ad', '#f39c12', '#27ae60', '#e67e22'];

export class Game {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 20251018;
    this.map = buildMap(this.seed);
    this.rnd = mulberry32(this.seed ^ 0x9e3779b9);
    this.players = new Map();   // id -> player
    this.cars = new Map();      // id -> car
    this.nextCarId = 1;
    this.nextPlayerId = 1;
    this.pendingShots = [];
    this.tickCount = 0;
    this.lastSnapshot = 0;
    this.io = null;             // set oleh index.js
    this.aiTarget = 22;

    this.spawnParkedCars(55);
    this.spawnTraffic(this.aiTarget);
  }

  // ---------------------------------------------------------------- setup

  spawnParkedCars(n) {
    for (let i = 0; i < n; i++) {
      // mobil parkir di pinggir jalan (bukan di lajur lalu lintas)
      const pt = randomRoadPoint(this.map, this.rnd, 40);
      const type = CAR_LIST[Math.floor(this.rnd() * CAR_LIST.length)];
      this.addCar({ type, x: pt.x, y: pt.y, a: pt.a, speed: 0, parked: true });
    }
    // mobil parkir di area parkir (lot)
    for (const lot of this.map.lots) {
      const rows = 3;
      for (let r = 0; r < rows; r++) {
        const ly = lot.y + (lot.h / rows) * r + 28;
        for (let k = 0; k < 4; k++) {
          if (this.rnd() < 0.35) continue;
          const lx = lot.x + 30 + k * ((lot.w - 60) / 3.2);
          const type = CAR_LIST[Math.floor(this.rnd() * CAR_LIST.length)];
          this.addCar({ type, x: lx, y: ly, a: 0, speed: 0, parked: true });
        }
      }
    }
  }

  spawnTraffic(n) {
    for (let i = 0; i < n; i++) this.spawnAiCar();

    // pejalan kaki (NPC) di trotoar
    this.peds = new Map();
    this.nextPedId = 1;
    this.pedTarget = 46;
    for (let i = 0; i < this.pedTarget; i++) this.spawnPed();

    // cuaca (0 cerah, 1 berawan, 2 hujan) - berubah tiap beberapa menit
    this.weather = { kind: 0, until: Date.now() + 150000 };

    // pekerjaan pengiriman (global, bisa dikejar siapa aja)
    this.job = null;
    this.jobCooldown = 0;
    this.nextJob();
  }

  spawnAiCar(forceType) {
    const pt = randomRoadPoint(this.map, this.rnd, 16);
    const r = this.rnd();
    const type = forceType
      || (r < 0.1 ? 'police' : r < 0.18 ? 'motorbike' : r < 0.32 ? 'truck'
        : r < 0.45 ? 'taxi' : r < 0.58 ? 'tractor' : r < 0.8 ? 'sport' : 'sedan');
    const car = this.addCar({ type, x: pt.x, y: pt.y, a: pt.a, speed: 120 + this.rnd() * 80, ai: true });
    // tentukan node terdekat untuk jalur AI
    const n = this.map.size / this.map.cell;
    const i = clamp(Math.round(pt.x / this.map.cell), 0, n);
    const j = clamp(Math.round(pt.y / this.map.cell), 0, n);
    const di = Math.abs(Math.cos(pt.a)) > .5 ? Math.sign(Math.cos(pt.a)) : 0;
    const dj = di ? 0 : Math.sign(Math.sin(pt.a));
    car.aiState = { i:di ? (di>0?Math.floor(pt.x/this.map.cell):Math.ceil(pt.x/this.map.cell)) : i, j:dj ? (dj>0?Math.floor(pt.y/this.map.cell):Math.ceil(pt.y/this.map.cell)) : j, di, dj };
    car.aiTarget = this.aiNextTarget(car);
    return car;
  }

  addCar(opts) {
    const id = this.nextCarId++;
    const T = CAR_TYPES[opts.type] || CAR_TYPES.sedan;
    const car = {
      id,
      type: opts.type,
      x: opts.x,
      y: opts.y,
      a: opts.a ?? 0,
      speed: opts.speed ?? 0,
      steerAngle: 0,
      color: opts.color || (opts.type === 'police' ? '#1b2631' : opts.type === 'taxi' ? '#f1a40f' : T.color),
      driver: null,
      ai: !!opts.ai,
      parked: !!opts.parked,
      maxSpeed: T.maxSpeed * (0.94 + this.rnd() * 0.12),
      aiState: null,
      aiTarget: null,
      chaseStuck: 0,
      chaseCooldown: 0,
      hit: false,
    };
    car.obeysLight = true;   // sebagian mobil nurut lampu merah
    this.cars.set(id, car);
    return car;
  }

  // ---------------------------------------------------------------- players

  addPlayer(name, id = this.nextPlayerId++) {
    this.nextPlayerId = Math.max(this.nextPlayerId, id + 1);
    const spawn = this.pickSpawn();
    const p = {
      id,
      name: sanitizeName(name) || `Player${id}`,
      color: PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length],
      x: spawn.x,
      y: spawn.y,
      a: 0,
      vx: 0,
      vy: 0,
      moving: false,
      health: PLAYER_MAX_HEALTH,
      dead: false,
      respawnAt: 0,
      car: null,
      kills: 0,
      deaths: 0,
      wanted: 0,
      lastCrime: 0,
      lastWantedDrop: 0,
      input: { mx: 0, my: 0, sprint: false, throttle: 0, steer: 0, handbrake: false },
      lastShot: 0,
      lastChat: 0,
      money: 0,
      stats: { jobs: 0, dist: 0, best: 0, time: 0 },
      connected: true,
      lastInput: performance.now(),
    };
    this.players.set(id, p);
    return p;
  }

  pickSpawn() {
    // 1) coba di dekat mobil parkir supaya pemain langsung bisa "curi" mobil
    //    (utamakan area tengah kota, bukan tepi map)
    const mid = this.map.size / 2;
    const all = [...this.cars.values()].filter((c) => c.parked);
    const central = all.filter((c) => Math.abs(c.x - mid) < this.map.size * 0.32 && Math.abs(c.y - mid) < this.map.size * 0.32);
    const parked = central.length > 6 ? central : all;
    for (let k = 0; k < 80 && parked.length; k++) {
      const car = parked[Math.floor(this.rnd() * parked.length)];
      const a = this.rnd() * Math.PI * 2;
      const d = 36 + this.rnd() * 24;
      const x = car.x + Math.cos(a) * d;
      const y = car.y + Math.sin(a) * d;
      if (this.isFreeSpot(x, y)) return { x, y };
    }
    // 2) fallback: di trotoar blok
    const spawns = this.map.spawns;
    const midSpawns = spawns.filter((s) => Math.abs(s.x - mid) < this.map.size * 0.34 && Math.abs(s.y - mid) < this.map.size * 0.34);
    const pool = midSpawns.length ? midSpawns : spawns;
    for (let k = 0; k < 200; k++) {
      const s = pool[Math.floor(this.rnd() * pool.length)];
      const x = s.x + (this.rnd() - 0.5) * 260;
      const y = s.y + (this.rnd() - 0.5) * 260;
      if (this.isFreeSpot(x, y)) return { x, y };
    }
    return { x: 300, y: 300 };
  }

  isFreeSpot(x, y) {
    if (isWater(this.map, x, y)) return false;
    for (const r of nearbyBlockers(this.map, x, y, 60)) {
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return false;
    }
    return true;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.car) {
      const car = this.cars.get(p.car);
      if (car) car.driver = null;
    }
    this.players.delete(id);
  }

  // ---------------------------------------------------------------- messages

  handleMessage(player, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    switch (msg.t) {
      case MSG.INPUT: {
        const i = player.input;
        const inp = msg.i || {};
        i.mx = Number.isFinite(inp.mx) ? clamp(inp.mx, -1, 1) : 0;
        i.my = Number.isFinite(inp.my) ? clamp(inp.my, -1, 1) : 0;
        i.sprint = !!inp.sprint;
        i.throttle = Number.isFinite(inp.throttle) ? clamp(inp.throttle, -1, 1) : 0;
        i.steer = Number.isFinite(inp.steer) ? clamp(inp.steer, -1, 1) : 0;
        i.handbrake = !!inp.handbrake;
        break;
      }
      case MSG.FIRE: {
        const now = performance.now() / 1000;
        if (now - player.lastShot < WEAPON.pistol.rate) return;
        player.lastShot = now;
        this.pendingShots.push({ id: player.id, a: Number.isFinite(msg.a) ? msg.a : player.a, sx: player.x, sy: player.y });
        break;
      }
      case MSG.ENTER: this.tryEnterCar(player); break;
      case MSG.EXIT: this.tryExitCar(player); break;
      case MSG.HORN: this.broadcast({ t: MSG.SFX, k: 'horn', i: player.id, x: player.x, y: player.y }); break;
      case MSG.CHAT: {
        const now = performance.now();
        if (now - player.lastChat < 350) return;
        player.lastChat = now;
        const text = sanitizeChat(msg.m);
        if (!text) return;
        this.broadcast({ t: MSG.CHAT, i: player.id, n: player.name, m: text, ts: Date.now() });
        break;
      }
      case MSG.LEADERBOARD: this.sendLeaderboard(player); break;
      case MSG.RESPAWN: this.tryRespawn(player); break;
      case MSG.PING: this.sendTo(player, { t: MSG.PONG, ts: msg.ts }); break;
      default: break;
    }
  }

  tryEnterCar(player) {
    if (player.car || player.dead) return;
    let best = null;
    let bestD = 115 * 115;
    for (const car of this.cars.values()) {
      if (car.driver) continue;
      const d = (car.x - player.x) ** 2 + (car.y - player.y) ** 2;
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) {
      this.sendTo(player, { t: MSG.SYSTEM, m: 'Tidak ada kendaraan di dekatmu.' });
      return;
    }
    if (Math.abs(best.speed) > 60) return;
    best.driver = player.id;
    best.parked = false;
    best.ai = false;
    best.aiState = null;
    best.speed = 0; best.vx = 0; best.vy = 0;
    player.car = best.id;
    player.x = best.x;
    player.y = best.y;
    player.a = best.a;
    this.broadcast({ t: MSG.SFX, k: 'door', x: best.x, y: best.y });
  }

  tryExitCar(player) {
    if (!player.car) return;
    const car = this.cars.get(player.car);
    if (!car) { player.car = null; return; }
    // keluar di sisi mobil
    const off = 26;
    let bx = car.x + Math.cos(car.a + Math.PI / 2) * off;
    let by = car.y + Math.sin(car.a + Math.PI / 2) * off;
    const rects = nearbyBlockers(this.map, bx, by, 80);
    for (const r of rects) {
      const res = resolveCircleRect(bx, by, PLAYER_RADIUS, r);
      if (res) { bx = res.x; by = res.y; }
    }
    car.driver = null;
    car.speed = 0; car.vx = 0; car.vy = 0;
    player.car = null;
    player.x = bx;
    player.y = by;
    player.vx = 0;
    player.vy = 0;
  }

  tryRespawn(player) {
    if (!player.dead) return;
    if (Date.now() < player.respawnAt) return;
    const s = this.pickSpawn();
    player.x = s.x;
    player.y = s.y;
    player.vx = 0;
    player.vy = 0;
    player.health = PLAYER_MAX_HEALTH;
    player.dead = false;
  }

  // ---------------------------------------------------------------- shooting

  processShots() {
    for (const shot of this.pendingShots) {
      const shooter = this.players.get(shot.id);
      if (!shooter || shooter.dead) continue;
      const W = WEAPON.pistol;
      const spread = (Math.random() - 0.5) * W.spread * 2;
      const a = shot.a + spread;
      const ex = shot.sx + Math.cos(a) * W.range;
      const ey = shot.sy + Math.sin(a) * W.range;

      this.broadcast({ t: MSG.SFX, k: 'shot', x: shot.sx, y: shot.sy, a });

      // cek pemain dulu (siapa yang di garis tembak, paling dekat)
      let victim = null;
      let bestT = Infinity;
      for (const p of this.players.values()) {
        if (p.id === shooter.id || p.dead) continue;
        if (p.car) continue; //#Lagi di dalam kendaraan = tidak bisa ditembak
        const t = rayCircle(shot.sx, shot.sy, ex, ey, p.x, p.y, PLAYER_RADIUS);
        if (t !== null && t < bestT) { bestT = t; victim = p; }
      }

      // tembok menghalangi? yang dicek HANYA sampai titik tabrakan,
      // jadi tembok jauh di belakang target gak ngancelin peluru
      const limit = victim ? bestT * W.range + 2 : W.range;
      const bx = shot.sx + Math.cos(a) * limit;
      const by = shot.sy + Math.sin(a) * limit;
      const rects = nearbyBlockers(this.map, shot.sx, shot.sy, limit + 40);
      let blocked = false;
      for (const r of rects) {
        if (segmentHitsRect(shot.sx, shot.sy, bx, by, r)) { blocked = true; break; }
      }
      if (blocked) continue;

      if (victim) {
        victim.health -= W.damage;
        this.broadcast({ t: MSG.SFX, k: 'hit', x: victim.x, y: victim.y });
        // menembak orang = naik wanted level
        this.addWanted(shooter, 1);
        if (victim.health <= 0) {
          victim.dead = true;
          victim.deaths++;
          victim.health = 0;
          victim.respawnAt = Date.now() + RESPAWN_TIME * 1000;
          if (victim.car) {
            const c = this.cars.get(victim.car);
            if (c) { c.driver = null; c.speed *= 0.3; }
            victim.car = null;
          }
          shooter.kills++;
          this.addWanted(shooter, 1);
          this.broadcast({ t: MSG.KILL, k: shooter.name, v: victim.name, ts: Date.now() });
        }
      }
    }
    this.pendingShots.length = 0;
  }

  // ---------------------------------------------------------------- wanted level

  addWanted(player, amount) {
    if (!player) return;
    player.wanted = Math.min(WANTED_MAX, player.wanted + amount);
    player.lastCrime = Date.now();
    this.sendTo(player, { t: MSG.SYSTEM, m: `Wanted level naik: ${'★'.repeat(player.wanted)}` });
  }

  decayWanted(player, now) {
    if (player.wanted <= 0) return;
    if (now - player.lastCrime < WANTED_DECAY_MS) return;
    if (now - player.lastWantedDrop < WANTED_STEP_MS) return;
    player.lastWantedDrop = now;
    player.wanted = Math.max(0, player.wanted - 1);
  }

  /** Cari pemain wanted terdekat dari sebuah mobil polisi. */
  findWantedTarget(car) {
    let best = null;
    let bestD = POLICE_RADIUS * POLICE_RADIUS;
    for (const p of this.players.values()) {
      if (p.wanted <= 0 || p.dead) continue;
      const d = (p.x - car.x) ** 2 + (p.y - car.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  bust(player) {
    player.dead = true;
    player.health = 0;
    player.deaths++;
    player.wanted = 0;
    player.respawnAt = Date.now() + BUST_RESPAWN * 1000;
    if (player.car) {
      const c = this.cars.get(player.car);
      if (c) { c.driver = null; c.speed *= 0.3; }
      player.car = null;
    }
    this.broadcast({ t: MSG.KILL, k: 'POLISI', v: player.name, bust: 1, ts: Date.now() });
  }

  // ---------------------------------------------------------------- AI traffic

  aiNextTarget(car) {
    const st = car.aiState;
    if (!st) return null;
    const C = this.map.cell;
    const n = this.map.size / C;
    // jangan sampai ke jalan paling tepi (bikin nempel batas map)
    const LIM = 1;
    st.i = clamp(st.i, LIM, n - LIM);
    st.j = clamp(st.j, LIM, n - LIM);
    let ni = st.i + st.di;
    let nj = st.j + st.dj;
    if (ni < LIM || nj < LIM || ni > n - LIM || nj > n - LIM) {
      // balik arah di tepi dunia
      st.di = -st.di; st.dj = -st.dj;
      ni = st.i + st.di; nj = st.j + st.dj;
      if (ni < LIM || nj < LIM || ni > n - LIM || nj > n - LIM) {
        // ganti sumbu arah
        const t = st.di; st.di = st.dj; st.dj = t;
        ni = st.i + st.di; nj = st.j + st.dj;
      }
      ni = clamp(ni, LIM, n - LIM); nj = clamp(nj, LIM, n - LIM);
    }
    const nx = ni * C;
    const ny = nj * C;
    // lajur kanan
    const rx = -st.dj * 16;
    const ry = st.di * 16;
    return { x: nx + rx, y: ny + ry, ni, nj };
  }

  stepAi(car, dt) {
    // --- mode mengejar: mobil polisi kejar pemain wanted ---
    if (car.type === 'police') {
      if (car.chaseCooldown > 0) car.chaseCooldown -= dt;
      const target = car.chaseCooldown > 0 ? null : this.findWantedTarget(car);
      if (target) {
        const dx = target.x - car.x;
        const dy = target.y - car.y;
        const dist = Math.hypot(dx, dy);
        if (dist < BUST_DISTANCE) {
          this.bust(target);
          car.speed = 0; car.vx=0;car.vy=0;
          return;
        }
        const desired = Math.atan2(dy, dx);
        let diff = ((desired - car.a + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (diff < -Math.PI) diff += Math.PI * 2;
        const steer = clamp(diff * 1.9, -1, 1);
        stepCar(car, { throttle: 1, steer, handbrake: false }, dt, this.map, this.weather.kind === 2);
        // kalau nyangkut di tembok, sebentar ikut jalan normal biar bisa keluar
        if (Math.abs(car.speed) < 35) car.chaseStuck = (car.chaseStuck || 0) + dt;
        else car.chaseStuck = 0;
        if (car.chaseStuck > 1.2) {
          car.chaseStuck = 0;
          car.chaseCooldown = 4;
          car.aiTarget = null;
        }
        return;
      }
    }

    const st = car.aiState || (car.aiState = { i: 0, j: 0, di: 0, dj: 0 });
    if (!car.aiTarget) {
      // re-acquire
      const n = this.map.size / this.map.cell;
      st.i = clamp(Math.round(car.x / this.map.cell), 0, n);
      st.j = clamp(Math.round(car.y / this.map.cell), 0, n);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      // pilih arah yang paling deket sama arah mobil sekarang (biar ga muter 180 deg)
      let best = dirs[0], bestDot = -2;
      for (const d of dirs) {
        const dot = Math.cos(car.a) * d[0] + Math.sin(car.a) * d[1];
        if (dot > bestDot + 0.25 || (dot > bestDot - 0.25 && this.rnd() < 0.5)) { bestDot = Math.max(bestDot, dot); best = d; }
      }
      st.di = best[0]; st.dj = best[1];
      car.aiTarget = this.aiNextTarget(car);
      return;
    }

    let tgt = car.aiTarget;
    const dx = tgt.x - car.x;
    const dy = tgt.y - car.y;
    const dist = Math.hypot(dx, dy);
    // target unreachable (kena macet / terlalu jauh) -> cari target baru
    if (dist > 850) {
      car.aiTarget = null;
      car.stuck = 0;
      return;
    }

    if (dist < 26) {
      // sampai persimpangan: pilih arah baru
      const r = this.rnd();
      const turn = r < 0.62 ? [st.di, st.dj] : r < 0.81 ? [-st.dj, st.di] : [st.dj, -st.di];
      st.di = turn[0]; st.dj = turn[1];
      st.i = tgt.ni; st.j = tgt.nj;
      car.aiTarget = this.aiNextTarget(car);
    }

    const desired = Math.atan2(dy, dx);
    let diff = ((desired - car.a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    // koreksi slip: kalo mobil melebar, counter-steer biar gak spin
    const steer = clamp(diff * 1.15, -1, 1);

    // mengerem kalau ada mobil di depan (lajur yang sama)
    let blocked = car.obeysLight ? this.trafficRed(car) : false;
    for (const other of this.cars.values()) {
      if (other.id === car.id) continue;
      const odx = other.x - car.x;
      const ody = other.y - car.y;
      const along = odx * Math.cos(car.a) + ody * Math.sin(car.a);
      if (along <= 0) continue; // di belakang
      const side = Math.abs(-odx * Math.sin(car.a) + ody * Math.cos(car.a));
      if (along < 80 && side < 14) { blocked = true; break; }
    }

    // nabrak tembok dengan kecepatan rendah -> mundur dulu, terus belok
    if (car.hit && Math.abs(car.speed) < 40) {
      car.backoff = (car.backoff || 0) + dt;
      if (car.backoff < 0.7) {
        stepCar(car, { throttle: -1, steer: -Math.sign(diff || 1) * 0.6, handbrake: false }, dt, this.map, this.weather.kind === 2);
        return;
      }
      car.backoff = 0;
    }

    // anti-stuck: kalau lama nggak gerak, pindah posisi
    if (Math.abs(car.speed) < 26 && !blocked) {
      car.stuck = (car.stuck || 0) + dt;
      if (car.stuck > 9) {
        car.stuck = 0;
        const pt = randomRoadPoint(this.map, this.rnd, 16);
        car.x = pt.x; car.y = pt.y; car.a = pt.a; car.speed = 120;
        car.vx = Math.cos(pt.a) * 120; car.vy = Math.sin(pt.a) * 120;
        car.aiTarget = null;
        return;
      }
    } else {
      car.stuck = 0;
    }

    let targetSpeed = car.maxSpeed * (0.5 + this.rnd() * 0.15) * (this.weather.kind === 2 ? 0.78 : 1);
    // pelan dikit kalo belok tajam atau lagi melebar
    targetSpeed *= 1 - Math.min(0.4, Math.abs(diff) * 0.35 + (car.slip || 0) * 0.0015);
    const throttle = blocked ? (car.speed > 5 ? -1 : 0) : (car.speed < targetSpeed ? 1 : 0);

    stepCar(car, { throttle, steer, handbrake: false }, dt, this.map, this.weather.kind === 2);
  }

  // ---------------------------------------------------------------- pejalan kaki

  /** Titik trotoar untuk pejalan kaki: blok (i,j) + arah (0=E,1=N,2=W,3=S) + jarak t. */
  pedPos(ped) {
    const C = this.map.cell;
    const RW = this.map.roadW ?? 96;
    const off = RW / 2 + 14;
    const L = C - RW - 28;
    const t = Math.max(0, Math.min(L, ped.t));
    let x, y;
    if (ped.dir === 0) { x = ped.i * C + off + t; y = ped.j * C + off; }
    else if (ped.dir === 1) { x = (ped.i + 1) * C - off; y = ped.j * C + off + t; }
    else if (ped.dir === 2) { x = (ped.i + 1) * C - off - t; y = (ped.j + 1) * C - off; }
    else { x = ped.i * C + off; y = (ped.j + 1) * C - off - t; }
    return { x, y, L };
  }

  spawnPed() {
    const n = this.map.size / this.map.cell;
    const i = Math.floor(this.rnd() * (n - 1));
    const j = Math.floor(this.rnd() * (n - 1));
    const dir = Math.floor(this.rnd() * 4);
    const ped = {
      id: this.nextPedId++,
      i, j, dir,
      t: this.rnd() * (this.map.cell - 124),
      speed: 55 + this.rnd() * 45,
      color: PED_COLORS[Math.floor(this.rnd() * PED_COLORS.length)],
      down: 0,
      x: 0, y: 0, a: 0,
    };
    const p = this.pedPos(ped);
    ped.x = p.x; ped.y = p.y;
    ped.a = [0, Math.PI / 2, Math.PI, -Math.PI / 2][ped.dir];
    this.peds.set(ped.id, ped);
    return ped;
  }

  stepPeds(dt) {
    const C = this.map.cell;
    for (const ped of this.peds.values()) {
      if (ped.down > 0) {
        ped.down -= dt;
        if (ped.down <= 0) { ped.down = 0; ped.t = Math.min(ped.t, C - 124); }
        continue;
      }
      ped.t += ped.speed * dt;
      const p = this.pedPos(ped);
      if (ped.t >= p.L) {
        ped.t = 0;
        ped.dir = (ped.dir + 1) % 4;
        const q = this.pedPos(ped);
        ped.x = q.x; ped.y = q.y;
        ped.a = [0, Math.PI / 2, Math.PI, -Math.PI / 2][ped.dir];
        continue;
      }
      ped.x = p.x; ped.y = p.y;
    }

    // ditabrak mobil? (kena dari belakang = terjatuh)
    for (const car of this.cars.values()) {
      const spd = Math.abs(car.speed);
      if (spd < 60) continue;
      for (const ped of this.peds.values()) {
        if (ped.down > 0) continue;
        const dx = ped.x - car.x, dy = ped.y - car.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 30 * 30) {
          ped.down = 6;
          ped.x += dx * 0.4; ped.y += dy * 0.4;
          car.speed *= 0.82;
          this.broadcast({ t: MSG.SFX, k: 'hit', x: ped.x, y: ped.y });
        }
      }
    }
  }

  // ---------------------------------------------------------------- pekerjaan

  nextJob() {
    const pt = randomRoadPoint(this.map, this.rnd, 20);
    this.job = {
      x: pt.x, y: pt.y,
      reward: 120 + Math.floor(this.rnd() * 180),
      until: Date.now() + 90000,
      taken: 0,
    };
  }

  stepJobs() {
    const now = Date.now();
    if (!this.job) { this.nextJob(); return; }
    if (this.job.taken && now - this.job.taken > 12000) { this.nextJob(); return; }
    if (now > this.job.until) { this.nextJob(); return; }
    // pemain yang sampai ke lokasi job dapat bayaran
    for (const p of this.players.values()) {
      if (p.dead) continue;
      if (this.job.taken) break;
      const d = Math.hypot(p.x - this.job.x, p.y - this.job.y);
      if (d < 55) {
        p.money = (p.money || 0) + this.job.reward;
        if (!p.stats) p.stats = { jobs: 0, dist: 0, best: 0, time: 0 };
        p.stats.jobs++;
        this.job.taken = now;
        this.sendTo(p, { t: MSG.SYSTEM, m: `Job selesai! +$${this.job.reward} (total $${p.money})` });
        this.broadcast({ t: MSG.SFX, k: 'horn', x: this.job.x, y: this.job.y });
      }
    }
  }

  // ---------------------------------------------------------------- leaderboard

  /** Baris leaderboard dari pemain yang online (skor gabungan). */
  leaderboardRows() {
    if (this.leaderboard) return this.leaderboard.top(25);
    return [...this.players.values()].map(p => ({ name:p.name, kills:p.kills, money:p.money || 0, jobs:p.stats?.jobs || 0, best:p.stats?.best || 0, online:true }))
      .sort((a,b) => b.money-a.money || b.kills-a.kills).slice(0,25);
  }

  sendLeaderboard(player = null) {
    const payload = { t:MSG.LEADERBOARD, rows:this.leaderboardRows() };
    if (player) this.sendTo(player, payload); else this.broadcast(payload);
  }

  // ---------------------------------------------------------------- lampu lalu lintas

  /** True kalau lampu untuk arah gerak mobil ini merah. */
  trafficRed(car) {
    const C = this.map.cell;
    const phase = Math.floor(Date.now() / 16000) % 2; // 0 = utara-selatan hijau
    const horiz = Math.abs(Math.cos(car.a)) > Math.abs(Math.sin(car.a));
    const d = horiz ? Math.cos(car.a) : Math.sin(car.a);
    const pos = horiz ? car.x : car.y;
    const next = d > 0 ? Math.ceil(pos / C) * C : Math.floor(pos / C) * C;
    const dist = Math.abs(next - pos);
    if (dist > Math.max(105, car.speed * car.speed / 1100 + 75) || dist < 50) return false;
    const ewRed = phase === 0;
    return horiz ? ewRed : !ewRed;
  }

  // ---------------------------------------------------------------- tick

  tick(dt) {
    this.tickCount++;

    // pemain
    const now = Date.now();
    for (const p of this.players.values()) {
      this.decayWanted(p, now);
      if (!p.stats) p.stats = { jobs: 0, dist: 0, best: 0, time: 0 };
      p.stats.time += dt;
      if (p.dead) {
        if (Date.now() >= p.respawnAt) this.tryRespawn(p);
        continue;
      }
      const px = p.x, py = p.y;
      if (p.car) {
        const car = this.cars.get(p.car);
        if (!car) { p.car = null; continue; }
        stepCar(car, p.input, dt, this.map, this.weather.kind === 2);
        p.x = car.x;
        p.y = car.y;
        p.a = car.a;
        p.vx = Math.cos(car.a) * car.speed;
        p.vy = Math.sin(car.a) * car.speed;
      } else {
        stepPlayer(p, p.input, dt, this.map, this.weather.kind === 2);
      }
      // statistik: jarak tempuh + kecepatan puncak
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < 400) p.stats.dist += d;
      const sp = Math.hypot(p.vx || 0, p.vy || 0);
      if (sp > p.stats.best) p.stats.best = sp;
    }

    // AI
    for (const car of this.cars.values()) {
      if (car.ai && !car.driver) this.stepAi(car, dt);
    }

    // tabrakan antar mobil
    resolveCarCollisions([...this.cars.values()]);

    // NPC & pekerjaan
    this.stepPeds(dt);
    this.stepJobs();

    // cuaca berubah
    if (now > this.weather.until) {
      const r = this.rnd();
      this.weather.kind = r < 0.55 ? 0 : r < 0.82 ? 1 : 2;
      this.weather.until = now + 120000 + this.rnd() * 180000;
    }

    // tembak
    this.processShots();

    // jaga jumlah AI
    let aiCount = 0;
    let policeCount = 0;
    let maxWanted = 0;
    for (const p of this.players.values()) if (p.wanted > maxWanted) maxWanted = p.wanted;
    for (const car of this.cars.values()) {
      if (car.ai && !car.driver) {
        aiCount++;
        if (car.type === 'police') policeCount++;
      }
    }
    if (aiCount < this.aiTarget) this.spawnAiCar();
    // makin Wanted, makin banyak polisi
    const wantedPolice = maxWanted >= 3 ? 4 : maxWanted >= 1 ? 2 : 1;
    if (policeCount < wantedPolice) this.spawnAiCar('police');

    // snapshot
    if (now - this.lastSnapshot >= 1000 / SNAPSHOT_HZ) {
      this.lastSnapshot = now;
      this.sendSnapshot();
    }
  }

  /**
   * Snapshot per-pemain (interest management): cuma kirim entity yang deket.
   * Hemat banget buat HP (dari ~12KB/snapshot jadi ~2-4KB).
   */
  buildSnapshot(viewer) {
    const ps = [];
    for (const p of this.players.values()) {
      ps.push({
        i: p.id,
        n: p.name,
        c: p.color,
        x: Math.round(p.x),
        y: Math.round(p.y),
        a: Math.round(p.a * 100) / 100,
        h: p.health,
        k: p.kills,
        w: p.wanted,
        d: p.dead ? 1 : 0,
        r: Math.max(0, p.respawnAt - Date.now()),
        v: p.car || 0,
        $: p.money || 0,
      });
    }
    const cs = [];
    const vx = viewer ? viewer.x : 0;
    const vy = viewer ? viewer.y : 0;
    const R_CAR = 1400 * 1400;
    for (const car of this.cars.values()) {
      if (viewer) {
        const dx = car.x - vx, dy = car.y - vy;
        // mobil yang dipdrive pemain always deket (dari daftar main dia)
        if (dx * dx + dy * dy > R_CAR && car.driver !== viewer.id) continue;
      }
      cs.push({
        i: car.id,
        x: Math.round(car.x),
        y: Math.round(car.y),
        a: Math.round(car.a * 100) / 100,
        s: Math.round(car.speed),
        y2: car.type,
        c: car.color,
        d: car.driver || 0,
        h: car.hp === undefined ? 100 : car.hp,
      });
    }
    const ns = [];
    const R_PED = 900 * 900;
    for (const ped of this.peds.values()) {
      if (viewer) {
        const dx = ped.x - vx, dy = ped.y - vy;
        if (dx * dx + dy * dy > R_PED) continue;
      }
      ns.push({
        i: ped.id,
        x: Math.round(ped.x),
        y: Math.round(ped.y),
        a: Math.round(ped.a * 100) / 100,
        c: ped.color,
        d: ped.down > 0 ? 1 : 0,
      });
    }
    const job = this.job
      ? { x: Math.round(this.job.x), y: Math.round(this.job.y), u: Math.max(0, this.job.until - Date.now()), r: this.job.reward, t: this.job.taken ? 1 : 0 }
      : null;
    return { t: MSG.SNAPSHOT, ts: Date.now(), p: ps, c: cs, n: ns, j: job, wx: this.weather.kind };
  }

  sendSnapshot() {
    if (!this.io) return;
    // snapshot beda2 per pemain (cuma entity dket yg dikirim)
    for (const p of this.players.values()) {
      this.sendTo(p, this.buildSnapshot(p));
    }
  }

  // ---------------------------------------------------------------- io

  broadcast(obj) {
    if (!this.io) return;
    this.io.broadcastRaw(JSON.stringify(obj));
  }

  sendTo(player, obj) {
    if (!this.io) return;
    const raw = typeof obj === 'string' ? obj : JSON.stringify(obj);
    this.io.sendRaw(player.id, raw);
  }
}

function rayCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}

export function sanitizeName(name) {
  return String(name || '')
    .replace(/[^\p{L}\p{N} ._!-]/gu, '')
    .trim()
    .slice(0, 16);
}

export function sanitizeChat(text) {
  return String(text || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
